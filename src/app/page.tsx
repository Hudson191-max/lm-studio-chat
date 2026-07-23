'use client'

import { useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useChatStore } from '@/store/chat-store'
import { Sidebar } from '@/components/chat/sidebar'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'
import { SettingsDialog } from '@/components/chat/settings-dialog'
import { SearchDialog } from '@/components/chat/search-dialog'
import { ProfilesDialog } from '@/components/chat/profiles-dialog'
import { McpDialog } from '@/components/chat/mcp-dialog'
import { ChangePasswordDialog } from '@/components/chat/change-password-dialog'
import { SystemPromptBar } from '@/components/chat/system-prompt-bar'
import { AuthView } from '@/components/chat/auth-view'
import { Button } from '@/components/ui/button'
import { Menu, WifiOff, RefreshCw, LogOut, Loader2 } from 'lucide-react'

export default function Home() {
  const { data: session, status } = useSession()
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen)
  const connectionError = useChatStore((s) => s.connectionError)
  const setConnectionError = useChatStore((s) => s.setConnectionError)
  const setConversations = useChatStore((s) => s.setConversations)
  const setIsLoadingConversations = useChatStore((s) => s.setIsLoadingConversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const conversations = useChatStore((s) => s.conversations)
  const setMcpServers = useChatStore((s) => s.setMcpServers)
  const setAvailableModels = useChatStore((s) => s.setAvailableModels)
  const setModelContextLengths = useChatStore((s) => s.setModelContextLengths)
  const setSelectedModel = useChatStore((s) => s.setSelectedModel)
  const setConnected = useChatStore((s) => s.setConnected)

  // Load conversations when authenticated
  useEffect(() => {
    if (status !== 'authenticated') return
    setIsLoadingConversations(true)
    fetch('/api/conversations')
      .then((res) => res.json())
      .then((data) => {
        setConversations(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => setIsLoadingConversations(false))

    // Load MCP servers
    fetch('/api/mcp')
      .then((res) => res.json())
      .then((data) => setMcpServers(Array.isArray(data) ? data : []))
      .catch(() => {})

    // Fetch available models + context lengths from LM Studio so the
    // token usage indicator works without opening Settings first.
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        setConnected(!!data.connected)
        const models: Array<{ id: string; contextLength?: number }> = data.models || []
        setAvailableModels(models.map((m) => m.id))
        const ctxMap: Record<string, number> = {}
        for (const m of models) {
          if (m.contextLength) ctxMap[m.id] = m.contextLength
        }
        setModelContextLengths(ctxMap)
        // Auto-select first model if none selected
        const currentSelected = useChatStore.getState().selectedModel
        if (models.length > 0 && !currentSelected) {
          setSelectedModel(models[0].id)
        }
      })
      .catch(() => {})
  }, [status, setConversations, setIsLoadingConversations, setMcpServers, setAvailableModels, setModelContextLengths, setSelectedModel, setConnected])

  // Register service worker for PWA
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  if (!session) {
    return <AuthView />
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar username={session.user?.username} onLogout={() => signOut({ callbackUrl: '/' })} />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Bar */}
        <header className="flex h-12 items-center justify-between border-b px-3">
          <div className="flex items-center gap-2">
            {!sidebarOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <h1 className="text-sm font-medium">
              {activeConversationId
                ? conversations.find((c) => c.id === activeConversationId)?.title || 'Chat'
                : 'New Chat'}
            </h1>
          </div>

          <div className="flex items-center gap-1">
            <span className="mr-2 hidden text-xs text-muted-foreground sm:inline">
              {session.user?.username}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => signOut({ callbackUrl: '/' })}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* System Prompt Bar */}
        <SystemPromptBar />

        {/* Connection Error Banner */}
        {connectionError && (
          <div className="flex items-center gap-2 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{connectionError}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setConnectionError(null)
                fetch('/api/status')
                  .then((r) => r.json())
                  .then((d) => useChatStore.getState().setConnected(d.connected))
                  .catch(() => {})
              }}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          </div>
        )}

        {/* Messages */}
        <ChatMessages />

        {/* Input */}
        <ChatInput />
      </div>

      {/* Dialogs */}
      <SettingsDialog />
      <SearchDialog />
      <ProfilesDialog />
      <McpDialog />
      <ChangePasswordDialog />
    </div>
  )
}