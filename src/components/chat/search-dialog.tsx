'use client'

import { useState, useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Search, Loader2, MessageSquare, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SearchResult {
  id: string
  title: string
  matchingMessages: { id: string; role: string; content: string; snippet: string; createdAt: string }[]
}

export function SearchDialog() {
  const searchOpen = useChatStore((s) => s.searchOpen)
  const setSearchOpen = useChatStore((s) => s.setSearchOpen)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      setHasSearched(false)
      return
    }
    setIsSearching(true)
    setHasSearched(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data.results || [])
    } catch {
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSelect = (conversationId: string) => {
    setActiveConversation(conversationId)
    useChatStore.getState().clearCurrentChat()
    // Load conversation
    fetch(`/api/conversations/${conversationId}`)
      .then((r) => r.json())
      .then((conversation) => {
        if (conversation.messages) {
          useChatStore.getState().setMessages(
            conversation.messages.map((m: { id: string; role: string; content: string }) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
          )
        }
      })
      .catch(() => {})
    setSearchOpen(false)
    setQuery('')
    setResults([])
    setHasSearched(false)
  }

  return (
    <Dialog open={searchOpen} onOpenChange={(open) => {
      setSearchOpen(open)
      if (!open) { setQuery(''); setResults([]); setHasSearched(false) }
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Search Conversations</DialogTitle>
          <DialogDescription>Find messages across all your conversations.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              doSearch(e.target.value)
            }}
            placeholder="Search for messages..."
            className="pl-9"
            autoFocus
          />
          {isSearching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-[300px] overflow-y-auto space-y-2">
          {!hasSearched && (
            <p className="text-sm text-muted-foreground text-center py-8">Type to search your conversations</p>
          )}
          {hasSearched && !isSearching && results.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No results found</p>
          )}
          {results.map((result) => (
            <div key={result.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{result.title}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleSelect(result.id)}>
                  Open <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
              {result.matchingMessages.map((msg) => (
                <div key={msg.id} className="pl-5 text-xs text-muted-foreground border-l-2 border-muted">
                  <span className="font-medium capitalize">{msg.role}</span>
                  <p className="mt-0.5 italic">&quot;{msg.snippet}&quot;</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}