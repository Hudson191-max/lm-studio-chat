'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useChatStore } from '@/store/chat-store'
import { Bot, User, Loader2, RefreshCw, Pencil, Check, X, Wrench, Brain, ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CodeBlock } from '@/components/chat/code-block'

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages)
  const streamingContent = useChatStore((s) => s.streamingContent)
  const streamingThinking = useChatStore((s) => s.streamingThinking)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, streamingThinking, scrollToBottom])

  const startEdit = (msg: typeof messages[0]) => {
    setEditingId(msg.id)
    setEditContent(msg.content)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditContent('')
  }

  const saveEdit = async (msgId: string) => {
    try {
      await fetch(`/api/messages/${msgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      useChatStore.getState().updateMessage(msgId, { content: editContent, editedAt: new Date().toISOString() })
      const idx = useChatStore.getState().messages.findIndex((m) => m.id === msgId)
      if (idx >= 0) {
        useChatStore.getState().removeMessagesFrom(idx + 1)
      }
    } catch { /* silent */ }
    setEditingId(null)
    setEditContent('')
  }

  const handleRegenerate = () => {
    const msgs = useChatStore.getState().messages
    if (msgs.length < 2) return
    const lastMsg = msgs[msgs.length - 1]
    if (lastMsg.role !== 'assistant') return
    const newMsgs = msgs.slice(0, -1)
    useChatStore.getState().setMessages(newMsgs)
    window.dispatchEvent(new CustomEvent('chat:regenerate'))
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-4 py-6"
      style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
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
              You can paste or drag images for vision models.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLast={idx === messages.length - 1}
            isStreaming={isStreaming}
            onEdit={() => startEdit(msg)}
            isEditing={editingId === msg.id}
            editContent={editContent}
            onEditContentChange={setEditContent}
            onSaveEdit={() => saveEdit(msg.id)}
            onCancelEdit={cancelEdit}
            onRegenerate={msg.role === 'assistant' && idx === messages.length - 1 && !isStreaming ? handleRegenerate : undefined}
          />
        ))}

        {isStreaming && (streamingContent || streamingThinking) && (
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              thinking: streamingThinking || undefined,
            }}
            isLast={true}
            isStreaming={true}
          />
        )}

        {isStreaming && !streamingContent && !streamingThinking && (
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

function ThinkingBlock({ thinking, isStreaming }: { thinking: string; isStreaming?: boolean }) {
  const [expanded, setExpanded] = useState(true)

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      const timer = setTimeout(() => setExpanded(false), 500)
      return () => clearTimeout(timer)
    }
  }, [isStreaming])

  if (!thinking) return null

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1.5"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Brain className="h-3 w-3" />
        <span>
          {isStreaming ? 'Reasoning...' : `Reasoning (${thinking.length} chars)`}
        </span>
      </button>
      {expanded && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed max-h-80 overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border) transparent' }}
        >
          <p className="whitespace-pre-wrap">{thinking}</p>
        </div>
      )}
    </div>
  )
}

function MessageBubble({
  message,
  isLast,
  isStreaming,
  onEdit,
  isEditing,
  editContent,
  onEditContentChange,
  onSaveEdit,
  onCancelEdit,
  onRegenerate,
}: {
  message: { id: string; role: string; content: string; thinking?: string; images?: string[]; toolCalls?: unknown[]; editedAt?: string }
  isLast?: boolean
  isStreaming?: boolean
  onEdit?: () => void
  isEditing?: boolean
  editContent?: string
  onEditContentChange?: (v: string) => void
  onSaveEdit?: () => void
  onCancelEdit?: () => void
  onRegenerate?: () => void
}) {
  const isUser = message.role === 'user'
  const hasImages = message.images && message.images.length > 0
  const hasThinking = !!message.thinking

  if (isEditing && onEditContentChange) {
    return (
      <div className="flex gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <User className="h-4 w-4" />
        </div>
        <div className="flex-1 space-y-2 rounded-2xl rounded-tr-sm border bg-background px-4 py-3">
          <Textarea
            value={editContent}
            onChange={(e) => onEditContentChange(e.target.value)}
            className="min-h-[60px] text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={onSaveEdit} disabled={!editContent?.trim()}>
              <Check className="h-3.5 w-3.5 mr-1" /> Save
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
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
            <div>
              {/* Display images */}
              {hasImages && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {(message.images || []).map((img, idx) => (
                    <div key={idx} className="overflow-hidden rounded-lg max-w-[200px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Image ${idx + 1}`} className="max-h-48 w-auto object-contain rounded-lg" />
                    </div>
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.editedAt && (
                <p className="mt-1 text-[10px] opacity-60">edited</p>
              )}
            </div>
          ) : (
            <div>
              {/* Thinking / Reasoning section */}
              {hasThinking && (
                <ThinkingBlock thinking={message.thinking || ''} isStreaming={isStreaming} />
              )}
              {/* Main content */}
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkMath]}
                  rehypePlugins={[
                    rehypeKatex,
                    [rehypeHighlight, { detect: true, ignoreMissing: true }],
                  ]}
                  components={{
                    // Wrap fenced code blocks with our CodeBlock (copy button + dark surface)
                    pre({ children, ...props }) {
                      // children is the <code> element produced by react-markdown.
                      // Pull its className through to CodeBlock so it can detect language.
                      const codeEl = children as React.ReactElement<{ className?: string }> | undefined
                      const codeClassName =
                        codeEl && typeof codeEl === 'object' && 'props' in codeEl
                          ? codeEl.props.className
                          : undefined
                      return (
                        <CodeBlock className={codeClassName}>{children}</CodeBlock>
                      )
                    },
                    // Inline code: keep simple, just style it
                    code({ className, children, ...rest }) {
                      // If the code has a language-* class, it's a fenced block — let <pre> handle it
                      const isBlock = /language-/.test(className || '')
                      if (isBlock) {
                        return (
                          <code className={className} {...rest}>
                            {children}
                          </code>
                        )
                      }
                      return (
                        <code
                          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
                          {...rest}
                        >
                          {children}
                        </code>
                      )
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {isStreaming && !message.thinking && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current opacity-70" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!isStreaming && (
        <div className={`flex gap-1 mt-1 ${isUser ? 'justify-end pr-12' : 'pl-12'}`}>
          {isUser && onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onEdit}
              title="Edit message"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onRegenerate && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={onRegenerate}
              title="Regenerate response"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* Tool calls indicator */}
      {message.toolCalls && Array.isArray(message.toolCalls) && message.toolCalls.length > 0 && (
        <div className="ml-12 mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wrench className="h-3 w-3" />
          <span>{(message.toolCalls as unknown[]).length} tool call{(message.toolCalls as unknown[]).length > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}