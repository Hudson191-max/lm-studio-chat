'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import {
  Users, MessageSquare, Brain, LogIn, Plus, Trash2, Shield,
  ArrowLeft, Loader2, Eye, EyeOff, UserPlus, Power
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useChatStore } from '@/store/chat-store'

interface UserRow {
  id: string
  username: string
  role: string
  createdAt: string
  messageCount: number
  _count: { conversations: number; loginAttempts: number }
}

interface LoginRow {
  id: string
  username: string
  ip: string
  success: boolean
  createdAt: string
}

interface Stats {
  totalUsers: number
  totalConversations: number
  totalMessages: number
  totalLogins: number
  messagesToday: number
  activeToday: number
  users: UserRow[]
  recentLogins: LoginRow[]
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)

  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats')
      if (res.status === 403) {
        router.push('/')
        return
      }
      const data = await res.json()
      setStats(data)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (status === 'loading') return
    if (!session) {
      router.push('/')
      return
    }
    if (session.user?.role !== 'admin') {
      router.push('/')
      return
    }
    loadStats()
  }, [session, status, router, loadStats])

  const handleCreateUser = async () => {
    setCreateError('')
    setCreating(true)
    try {
      const res = await fetch('/api/admin/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error || 'Failed to create user')
        return
      }
      setCreateOpen(false)
      setNewUsername('')
      setNewPassword('')
      loadStats()
    } catch {
      setCreateError('Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    setDeletingId(userId)
    try {
      await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      loadStats()
    } catch {
      // silent
    } finally {
      setDeletingId(null)
    }
  }

  if (status === 'loading' || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Admin Panel</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{session.user?.username}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={async () => {
              if (!confirm('Stop the server? This will shut down both Next.js (port 3000) and Hound (port 8765). The page will stop responding. You will need to restart it from the command line (START.bat or npm run start:all).')) return
              try {
                await fetch('/api/admin/stop-server', { method: 'POST' })
              } catch {
                // Expected — the server is shutting down
              }
              setTimeout(() => {
                alert('Server is shutting down. Close this tab and restart it from the command line when ready.')
              }, 1500)
            }}
            title="Stop server (shuts down Next.js + Hound)"
          >
            <Power className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => signOut({ callbackUrl: '/' })}
            title="Sign out"
          >
            <LogIn className="h-4 w-4" style={{ transform: 'scaleX(-1)' }} />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="mx-auto max-w-5xl">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : stats ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 mb-6">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> Users
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <p className="text-2xl font-bold">{stats.totalUsers}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3" /> Chats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <p className="text-2xl font-bold">{stats.totalConversations}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Brain className="h-3 w-3" /> Messages
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <p className="text-2xl font-bold">{stats.totalMessages}</p>
                    <p className="text-[10px] text-muted-foreground">{stats.messagesToday} today</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <LogIn className="h-3 w-3" /> Logins
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <p className="text-2xl font-bold">{stats.totalLogins}</p>
                    <p className="text-[10px] text-muted-foreground">{stats.activeToday} active today</p>
                  </CardContent>
                </Card>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="users">
                <TabsList className="mb-4">
                  <TabsTrigger value="users" className="gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Users
                  </TabsTrigger>
                  <TabsTrigger value="logins" className="gap-1.5">
                    <LogIn className="h-3.5 w-3.5" /> Login Log
                  </TabsTrigger>
                </TabsList>

                {/* Users Tab */}
                <TabsContent value="users">
                  <Card>
                    <CardHeader className="flex-row items-center justify-between pb-3">
                      <CardTitle className="text-sm">User Management</CardTitle>
                      <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                        <UserPlus className="h-3.5 w-3.5" /> Add User
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="max-h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Username</TableHead>
                              <TableHead>Role</TableHead>
                              <TableHead>Chats</TableHead>
                              <TableHead>Messages</TableHead>
                              <TableHead>Logins</TableHead>
                              <TableHead>Created</TableHead>
                              <TableHead className="w-10"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.users.map((user) => (
                              <TableRow key={user.id}>
                                <TableCell className="font-medium">{user.username}</TableCell>
                                <TableCell>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                    user.role === 'admin'
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {user.role}
                                  </span>
                                </TableCell>
                                <TableCell>{user._count.conversations}</TableCell>
                                <TableCell>{user.messageCount}</TableCell>
                                <TableCell>{user._count.loginAttempts}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                                <TableCell>
                                  {user.id !== session.user?.id && (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-7 w-7">
                                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Delete user &quot;{user.username}&quot;?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will permanently delete this user, all their conversations, and messages.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            disabled={deletingId === user.id}
                                          >
                                            {deletingId === user.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                            Delete
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Login Log Tab */}
                <TabsContent value="logins">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Recent Login Attempts</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="max-h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              <TableHead>Username</TableHead>
                              <TableHead>IP Address</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {stats.recentLogins.map((log) => (
                              <TableRow key={log.id}>
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                  {formatDate(log.createdAt)}
                                </TableCell>
                                <TableCell className="font-medium">{log.username || '-'}</TableCell>
                                <TableCell className="font-mono text-xs">{log.ip}</TableCell>
                                <TableCell>
                                  {log.success ? (
                                    <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Success</span>
                                  ) : (
                                    <span className="text-destructive text-xs font-medium">Failed</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                            {stats.recentLogins.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                                  No login attempts recorded yet.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-20">Failed to load stats.</p>
          )}
        </div>
      </div>

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Add a new user who can sign in to LM Studio Chat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-username">Username</Label>
              <Input
                id="new-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Minimum 3 characters"
                minLength={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            {createError && <p className="text-sm text-destructive">{createError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreateUser}
              disabled={creating || !newUsername.trim() || newPassword.length < 6}
            >
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}