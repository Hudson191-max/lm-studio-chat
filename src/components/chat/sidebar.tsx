'use client'

import { useChatStore } from '@/store/chat-store'
import { cn } from '@/lib/utils'
import {
  Plus, MessageSquare, Trash2, PanelLeftClose, Settings, Cpu,
  Wifi, WifiOff, LogOut, Search, Layers, Wrench, KeyRound, Shield

} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface SidebarProps {
  username?: string
  onLogout: () => void
}

import { useSession } from 'next-auth/react'

export function Sidebar({ username, onLogout }: SidebarProps) {
  const isAdmin = useSession()?.data?.user?.role === 'admin'
  const conversations = useChatStore((s) => s.conversations)
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const sidebarOpen = useChatStore((s) => s.sidebarOpen)
  const isConnected = useChatStore((s) => s.isConnected)

  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const setSearchOpen = useChatStore((s) => s.setSearchOpen)
  const setProfilesOpen = useChatStore((s) => s.setProfilesOpen)
  const setMcpOpen = useChatStore((s) => s.setMcpOpen)
  const setChangePasswordOpen = useChatStore((s) => s.setChangePasswordOpen)
  const removeConversation = useChatStore((s) => s.removeConversation)

  const handleNewChat = async () => {
    try {
      const sp = useChatStore.getState().currentSystemPrompt
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: sp || undefined }),
      })
      const newConvo = await res.json()
      useChatStore.getState().addConversation(newConvo)
    } catch { /* silent */ }
  }

  const handleSelectConversation = async (id: string) => {
    if (id === activeConversationId) return
    setActiveConversation(id)
    useChatStore.getState().clearCurrentChat()

    try {
      const res = await fetch(`/api/conversations/${id}`)
      const conversation = await res.json()
      if (conversation.messages) {
        useChatStore.getState().setMessages(
          conversation.messages.map((m: { id: string; role: string; content: string; thinking?: string; images?: string; toolCalls?: string; editedAt?: string; createdAt?: string }) => {
            // Parse attachments: supports both legacy array format (old messages)
            // and new object format { images: [], files: [] }
            let images: string[] | undefined
            let files: Array<{ name: string; ext: string; chars: number; truncated?: boolean }> | undefined
            if (m.images) {
              try {
                const parsed = JSON.parse(m.images)
                if (Array.isArray(parsed)) {
                  images = parsed
                } else if (parsed && typeof parsed === 'object') {
                  images = parsed.images || undefined
                  files = parsed.files || undefined
                }
              } catch {
                images = undefined
              }
            }
            return {
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              thinking: m.thinking || undefined,
              images,
              files,
              toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
              editedAt: m.editedAt,
              createdAt: m.createdAt,
            }
          })
        )
      }
      if (conversation.systemPrompt) {
        useChatStore.getState().setCurrentSystemPrompt(conversation.systemPrompt)
      }
    } catch { /* silent */ }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      removeConversation(id)
    } catch { /* silent */ }
  }

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r bg-background transition-transform duration-200 md:relative md:z-auto md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-3 py-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">LM Studio Chat</span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {isConnected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs text-destructive">Disconnected</span>
            </>
          )}
        </div>

        {/* New Chat Button */}
        <div className="p-2">
          <Button onClick={handleNewChat} className="w-full justify-start gap-2" variant="outline">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1 px-2">
          <div className="space-y-0.5 pb-4">
            {conversations.length === 0 && (
              <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                No conversations yet. Start a new chat!
              </p>
            )}
            {conversations.map((convo) => (
              <div
                key={convo.id}
                className={cn(
                  'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors hover:bg-accent',
                  convo.id === activeConversationId && 'bg-accent'
                )}
                onClick={() => handleSelectConversation(convo.id)}
              >
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{convo.title}</span>
                  {convo.profile && (
                    <span className="block text-[10px] text-muted-foreground truncate">{convo.profile.name}</span>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete &quot;{convo.title}&quot; and all its messages.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => { e.stopPropagation(); handleDelete(convo.id) }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t p-1.5 space-y-0.5">
          <Button variant="ghost" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setSearchOpen(true)}>
            <Search className="h-3.5 w-3.5" />
            Search Chats
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setProfilesOpen(true)}>
            <Layers className="h-3.5 w-3.5" />
            Model Profiles
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setMcpOpen(true)}>
            <Wrench className="h-3.5 w-3.5" />
            MCP Tools
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setSettingsOpen(true)}>
            <Settings className="h-3.5 w-3.5" />
            Settings
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-2 h-8 text-xs" onClick={() => setChangePasswordOpen(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            Change Password
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 h-8 text-xs text-primary hover:text-primary"
              onClick={() => window.location.href = '/admin'}
            >
              <Shield className="h-3.5 w-3.5" />
              Admin Panel
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 h-8 text-xs text-destructive hover:text-destructive"
            onClick={onLogout}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
            {username && (
              <span className="ml-auto text-[10px] text-muted-foreground">{username}</span>
            )}
          </Button>
        </div>
      </aside>
    </>
  )
}