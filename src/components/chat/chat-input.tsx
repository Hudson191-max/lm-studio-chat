'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent, ClipboardEvent, DragEvent } from 'react'
import { useChatStore } from '@/store/chat-store'
import { SendHorizontal, Square, Download, Sparkles, ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function ChatInput() {
  const [input, setInput] = useState('')
  const [images, setImages] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const messages = useChatStore((s) => s.messages)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const selectedModel = useChatStore((s) => s.selectedModel)
  const currentSystemPrompt = useChatStore((s) => s.currentSystemPrompt)
  const mcpServers = useChatStore((s) => s.mcpServers)

  const addMessage = useChatStore((s) => s.addMessage)
  const setStreamingContent = useChatStore((s) => s.setStreamingContent)
  const appendStreamingContent = useChatStore((s) => s.appendStreamingContent)
  const appendStreamingThinking = useChatStore((s) => s.appendStreamingThinking)
  const setIsStreaming = useChatStore((s) => s.setIsStreaming)
  const setConnected = useChatStore((s) => s.setConnected)
  const setConnectionError = useChatStore((s) => s.setConnectionError)

  const getMcpTools = useCallback(() => {
    const tools: { name: string; description?: string; inputSchema?: unknown }[] = []
    for (const server of mcpServers) {
      if (server.enabled && server.tools) {
        for (const tool of server.tools) {
          tools.push(tool as { name: string; description?: string; inputSchema?: unknown })
        }
      }
    }
    return tools
  }, [mcpServers])

  // Handle image paste
  const handlePaste = useCallback(async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) {
          const base64 = await fileToBase64(file)
          setImages((prev) => [...prev, base64])
        }
        return
      }
    }
  }, [])

  // Handle drag and drop
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer?.files || [])
    const imageFiles = files.filter((f) => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    const base64List = await Promise.all(imageFiles.map(fileToBase64))
    setImages((prev) => [...prev, ...base64List])
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const sendMessage = useCallback(async (overrideMessages?: typeof messages) => {
    const msgs = overrideMessages || messages
    const trimmed = input.trim()
    if ((!trimmed && images.length === 0 && !overrideMessages) || isStreaming) return

    let conversationId = activeConversationId

    if (!conversationId) {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ systemPrompt: currentSystemPrompt || undefined }),
        })
        const newConvo = await res.json()
        conversationId = newConvo.id
        useChatStore.getState().addConversation(newConvo)
      } catch { return }
    }

    const currentImages = images.length > 0 ? [...images] : undefined

    if (!overrideMessages) {
      const userMsgId = `msg-${Date.now()}-user`
      addMessage({ id: userMsgId, role: 'user', content: trimmed, images: currentImages })
      setInput('')
      setImages([])
    }

    setIsStreaming(true)
    setStreamingContent('')
    useChatStore.getState().setStreamingThinking('')
    setConnectionError(null)

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Build messages array - include images for user messages
    const apiMessages = (overrideMessages || messages).map((m) => ({
      role: m.role,
      content: m.content,
      images: m.images,
    }))
    if (!overrideMessages) {
      apiMessages.push({ role: 'user' as const, content: trimmed, images: currentImages })
    }

    abortControllerRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          conversationId,
          model: selectedModel || undefined,
          systemPrompt: currentSystemPrompt || undefined,
          mcpTools: getMcpTools(),
          regenerate: !!overrideMessages,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmedLine = line.trim()
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue

          const data = trimmedLine.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.content) {
              appendStreamingContent(parsed.content)
              setConnected(true)
            }
            if (parsed.thinking) {
              appendStreamingThinking(parsed.thinking)
            }
            if (parsed.toolCalls) {
              useChatStore.getState().setStreamingToolCalls(parsed.toolCalls)
            }
            if (parsed.error) {
              setConnectionError(parsed.error)
            }
          } catch { /* skip */ }
        }
      }

      const finalContent = useChatStore.getState().streamingContent
      const finalThinking = useChatStore.getState().streamingThinking
      if (finalContent || finalThinking) {
        addMessage({
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: finalContent,
          thinking: finalThinking || undefined,
        })
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        const errContent = useChatStore.getState().streamingContent
        const errThinking = useChatStore.getState().streamingThinking
        if (errContent || errThinking) {
          addMessage({
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: errContent,
            thinking: errThinking || undefined,
          })
        }
        setConnectionError(error.message)
        setConnected(false)
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      useChatStore.getState().setStreamingThinking('')
      abortControllerRef.current = null
    }
  }, [input, images, isStreaming, activeConversationId, selectedModel, messages, currentSystemPrompt, mcpServers, addMessage, setStreamingContent, appendStreamingContent, appendStreamingThinking, setIsStreaming, setConnected, setConnectionError, getMcpTools])

  // Listen for regenerate events
  useEffect(() => {
    const handler = () => {
      const msgs = useChatStore.getState().messages
      sendMessage(msgs)
    }
    window.addEventListener('chat:regenerate', handler)
    return () => window.removeEventListener('chat:regenerate', handler)
  }, [sendMessage])

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
  }

  const handleExport = async () => {
    if (!activeConversationId) return
    window.open(`/api/conversations/${activeConversationId}/export`, '_blank')
  }

  const handleImageUpload = () => {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.multiple = true
    fileInput.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      const base64List = await Promise.all(files.map(fileToBase64))
      setImages((prev) => [...prev, ...base64List])
    }
    fileInput.click()
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Image previews */}
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="group relative h-16 w-16 overflow-hidden rounded-lg border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img} alt={`Upload ${idx + 1}`} className="h-full w-full object-cover" />
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/20"
        >
          {activeConversationId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              onClick={handleExport}
              title="Export conversation"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg"
            onClick={handleImageUpload}
            title="Attach image"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type your message... (paste or drag images for vision)"
            className="min-h-[40px] max-h-[200px] flex-1 resize-none border-0 bg-transparent p-2 text-sm shadow-none focus-visible:ring-0"
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-9 w-9 shrink-0 rounded-lg"
              onClick={stopStreaming}
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              onClick={() => sendMessage()}
              disabled={!input.trim() && images.length === 0}
            >
              <SendHorizontal className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            <span>
              {useChatStore.getState().mcpServers.filter((s) => s.enabled).length} MCP tool(s) active
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Connected to your local LM Studio server
          </p>
        </div>
      </div>
    </div>
  )
}