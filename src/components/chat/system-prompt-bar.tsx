'use client'

import { useState } from 'react'
import { useChatStore } from '@/store/chat-store'
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function SystemPromptBar() {
  const currentSystemPrompt = useChatStore((s) => s.currentSystemPrompt)
  const setCurrentSystemPrompt = useChatStore((s) => s.setCurrentSystemPrompt)
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b">
      <button
        className="flex w-full items-center justify-between px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          <span>System Prompt</span>
          {currentSystemPrompt && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Active</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3">
          <Textarea
            value={currentSystemPrompt}
            onChange={(e) => setCurrentSystemPrompt(e.target.value)}
            placeholder="Set a system prompt for this conversation... e.g. &quot;You are a helpful coding assistant that answers in Dutch.&quot;"
            className="min-h-[60px] text-xs"
            rows={3}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">
            The system prompt will be sent at the start of every message in this conversation.
          </p>
        </div>
      )}
    </div>
  )
}