'use client'

import { useState, useRef, useCallback, useEffect, KeyboardEvent } from 'react'
import { useChatStore } from '@/store/chat-store'
import { SendHorizontal, Square, Download, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ChatInput() {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

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
  const setIsStreaming = useChatStore((s) => s.setIsStreaming)
  const setConnected = useChatStore((s) => s.setConnected)
  const setConnectionError = useChatStore((s) => s.setConnectionError)

  // Get enabled MCP tools
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

  const sendMessage = useCallback(async (overrideMessages?: typeof messages) => {
    const msgs = overrideMessages || messages
    const trimmed = input.trim()
    if ((!trimmed && !overrideMessages) || isStreaming) return

    let conversationId = activeConversationId

    // If no active conversation, create one
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

    // If regenerating, don't add user message
    if (!overrideMessages) {
      const userMsgId = `msg-${Date.now()}-user`
      addMessage({ id: userMsgId, role: 'user', content: trimmed })
      setInput('')
    }

    setIsStreaming(true)
    setStreamingContent('')
    setConnectionError(null)

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Build messages array
    const apiMessages = (overrideMessages || messages).map((m) => ({
      role: m.role,
      content: m.content,
    }))
    if (!overrideMessages && trimmed) {
      apiMessages.push({ role: 'user' as const, content: trimmed })
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
      if (finalContent) {
        addMessage({
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: finalContent,
        })
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        const errContent = useChatStore.getState().streamingContent
        if (errContent) {
          addMessage({
            id: `msg-${Date.now()}-assistant`,
            role: 'assistant',
            content: errContent,
          })
        }
        setConnectionError(error.message)
        setConnected(false)
      }
    } finally {
      setIsStreaming(false)
      setStreamingContent('')
      abortControllerRef.current = null
    }
  }, [input, isStreaming, activeConversationId, selectedModel, messages, currentSystemPrompt, mcpServers, addMessage, setStreamingContent, appendStreamingContent, setIsStreaming, setConnected, setConnectionError, getMcpTools])

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

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring/20">
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
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
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
              disabled={!input.trim() && !isStreaming}
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