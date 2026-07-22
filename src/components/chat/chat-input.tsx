'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent, ClipboardEvent, DragEvent } from 'react'
import { useChatStore, AttachedFile } from '@/store/chat-store'
import { SendHorizontal, Square, Download, Sparkles, ImagePlus, X, FileText, Loader2 } from 'lucide-react'
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

interface PendingFile extends AttachedFile {
  text: string
  uploading?: boolean
  error?: string
}

// Extensions accepted for document upload
const DOC_EXTENSIONS = ['.pdf', '.txt', '.md', '.markdown', '.csv', '.docx']

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function ChatInput() {
  const [input, setInput] = useState('')
  const [images, setImages] = useState<string[]>([])
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
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
    const docFiles = files.filter((f) => DOC_EXTENSIONS.includes(getExt(f.name)))
    if (imageFiles.length === 0 && docFiles.length === 0) return
    if (imageFiles.length > 0) {
      const base64List = await Promise.all(imageFiles.map(fileToBase64))
      setImages((prev) => [...prev, ...base64List])
    }
    for (const f of docFiles) {
      uploadDocument(f)
    }
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const removeFile = useCallback((index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Upload a document to /api/upload for text extraction
  const uploadDocument = useCallback(async (file: File) => {
    const placeholder: PendingFile = {
      name: file.name,
      ext: getExt(file.name),
      chars: 0,
      text: '',
      uploading: true,
    }
    setPendingFiles((prev) => [...prev, placeholder])
    const idx = -1 // we'll match by reference below
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      setPendingFiles((prev) =>
        prev.map((p, i) =>
          p === placeholder || (i === prev.length - 1 && p.name === placeholder.name && p.uploading)
            ? {
                name: data.name,
                ext: data.ext,
                chars: data.chars,
                truncated: data.truncated,
                text: data.text,
                uploading: false,
              }
            : p
        )
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed'
      setPendingFiles((prev) =>
        prev.map((p) =>
          p === placeholder || (p.name === placeholder.name && p.uploading)
            ? { ...p, uploading: false, error: msg }
            : p
        )
      )
    }
    void idx
  }, [])

  const sendMessage = useCallback(async (overrideMessages?: typeof messages) => {
    const msgs = overrideMessages || messages
    const trimmed = input.trim()
    const hasUploadingFiles = pendingFiles.some((f) => f.uploading)
    const hasErroredFiles = pendingFiles.some((f) => f.error)
    if (hasUploadingFiles || hasErroredFiles) return
    if ((!trimmed && images.length === 0 && pendingFiles.length === 0 && !overrideMessages) || isStreaming) return

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
    const currentFiles = pendingFiles.length > 0 ? pendingFiles.map(({ name, ext, chars, truncated }) => ({ name, ext, chars, truncated })) : undefined

    // Build the full content sent to the AI: user's text + appended doc text
    // The doc text is wrapped in clear markers so the model knows the source.
    let fullContent = trimmed
    if (!overrideMessages && pendingFiles.length > 0) {
      const docBlocks = pendingFiles.map((f) => {
        const header = `[Attached document: ${f.name}${f.truncated ? ' (truncated)' : ''}]`
        return `${header}\n\n${f.text}\n\n[End of document: ${f.name}]`
      })
      fullContent = `${trimmed}${trimmed ? '\n\n---\n\n' : ''}${docBlocks.join('\n\n---\n\n')}`
    }

    if (!overrideMessages) {
      const userMsgId = `msg-${Date.now()}-user`
      // Store the original user-typed text (not the expanded doc text) for display,
      // but the API will receive the full content with doc text appended.
      addMessage({
        id: userMsgId,
        role: 'user',
        content: trimmed || (pendingFiles.length > 0 ? `[Attached: ${pendingFiles.map((f) => f.name).join(', ')}]` : ''),
        images: currentImages,
        files: currentFiles,
      })
      setInput('')
      setImages([])
      setPendingFiles([])
    }

    setIsStreaming(true)
    setStreamingContent('')
    useChatStore.getState().setStreamingThinking('')
    setConnectionError(null)

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Build messages array - include images + expanded content for user messages
    const apiMessages: Array<{ role: string; content: string; images?: string[]; files?: Array<{ name: string; ext: string; chars: number; truncated?: boolean }> }> = (overrideMessages || messages).map((m) => ({
      role: m.role,
      content: m.content,
      images: m.images,
    }))
    if (!overrideMessages) {
      apiMessages.push({ role: 'user' as const, content: fullContent, images: currentImages, files: currentFiles })
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
  }, [input, images, pendingFiles, isStreaming, activeConversationId, selectedModel, messages, currentSystemPrompt, mcpServers, addMessage, setStreamingContent, appendStreamingContent, appendStreamingThinking, setIsStreaming, setConnected, setConnectionError, getMcpTools])

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

  const handleDocUpload = () => {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = DOC_EXTENSIONS.join(',')
    fileInput.multiple = true
    fileInput.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      for (const f of files) {
        uploadDocument(f)
      }
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

        {/* Document file chips */}
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((f, idx) => (
              <div
                key={idx}
                className={`group flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                  f.error ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/40'
                }`}
              >
                <FileText className={`h-3.5 w-3.5 shrink-0 ${f.error ? 'text-destructive' : 'text-primary'}`} />
                <div className="flex flex-col">
                  <span className="font-medium truncate max-w-[180px]" title={f.name}>{f.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {f.uploading
                      ? 'Extracting text...'
                      : f.error
                      ? f.error
                      : `${f.ext.replace('.', '').toUpperCase()} · ${f.chars.toLocaleString()} chars${f.truncated ? ' · truncated' : ''}`}
                  </span>
                </div>
                {f.uploading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <button
                    onClick={() => removeFile(idx)}
                    className="ml-1 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    title="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
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
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg"
            onClick={handleDocUpload}
            title="Attach document (PDF, DOCX, TXT, MD, CSV)"
          >
            <FileText className="h-4 w-4" />
          </Button>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type your message... (drag images or documents to attach)"
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
              disabled={!input.trim() && images.length === 0 && pendingFiles.length === 0}
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