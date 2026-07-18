'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import { Bot, User, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, scrollToBottom])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-6"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">Chat with your Local AI</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Start a conversation with your LM Studio model. Make sure LM Studio is running with the local server enabled.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {isStreaming && streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} isStreaming />
        )}

        {isStreaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-muted px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({
  role,
  content,
  isStreaming,
}: {
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
}) {
  const isUser = role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : 'bg-muted rounded-tl-sm'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current opacity-70" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}