'use client'

import { useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useChatStore } from '@/store/chat-store'
import { Sidebar } from '@/components/chat/sidebar'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'
import { SettingsDialog } from '@/components/chat/settings-dialog'
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
  }, [status, setConversations, setIsLoadingConversations])

  // Show loading while checking session
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

  // Show auth view if not authenticated
  if (!session) {
    return <AuthView />
  }

  // Authenticated: show chat
  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar username={session.user?.username} onLogout={() => signOut({ callbackUrl: '/' })} />

      {/* Main Area */}
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

      {/* Settings Dialog */}
      <SettingsDialog />
    </div>
  )
}