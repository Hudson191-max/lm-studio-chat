'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { useChatStore } from '@/store/chat-store'
import { Bot, User, Loader2, RefreshCw, Pencil, Check, X, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function ChatMessages() {
  const messages = useChatStore((s) => s.messages)
  const streamingContent = useChatStore((s) => s.streamingContent)
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
  }, [messages, streamingContent, scrollToBottom])

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
      // Remove messages after this one (server already did it, just update UI)
      const idx = useChatStore.getState().messages.findIndex((m) => m.id === msgId)
      if (idx >= 0) {
        useChatStore.getState().removeMessagesFrom(idx + 1)
      }
    } catch { /* silent */ }
    setEditingId(null)
    setEditContent('')
  }

  const handleRegenerate = () => {
    // Remove last assistant message and re-send
    const msgs = useChatStore.getState().messages
    if (msgs.length < 2) return
    const lastMsg = msgs[msgs.length - 1]
    if (lastMsg.role !== 'assistant') return

    const newMsgs = msgs.slice(0, -1)
    useChatStore.getState().setMessages(newMsgs)

    // Trigger resend via custom event
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

        {isStreaming && streamingContent && (
          <MessageBubble
            message={{ id: 'streaming', role: 'assistant', content: streamingContent }}
            isLast={true}
            isStreaming={true}
          />
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
  message: { id: string; role: string; content: string; toolCalls?: unknown[]; editedAt?: string }
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
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.editedAt && (
                <p className="mt-1 text-[10px] opacity-60">edited</p>
              )}
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{message.content}</ReactMarkdown>
              {isStreaming && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-current opacity-70" />
              )}
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
          <span>{message.toolCalls.length} tool call{(message.toolCalls as unknown[]).length > 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  )
}