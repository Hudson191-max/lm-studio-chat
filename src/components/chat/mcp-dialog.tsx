'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/store/chat-store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Loader2, RefreshCw, Wrench, Plug } from 'lucide-react'

export function McpDialog() {
  const mcpOpen = useChatStore((s) => s.mcpOpen)
  const setMcpOpen = useChatStore((s) => s.setMcpOpen)
  const mcpServers = useChatStore((s) => s.mcpServers)
  const setMcpServers = useChatStore((s) => s.setMcpServers)

  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const loadServers = async () => {
    try {
      const res = await fetch('/api/mcp')
      const data = await res.json()
      setMcpServers(Array.isArray(data) ? data : [])
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (mcpOpen) loadServers()
  }, [mcpOpen, setMcpServers])

  const addServer = async () => {
    if (!name.trim() || !url.trim() || isAdding) return
    setIsAdding(true)
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      })
      const server = await res.json()
      setMcpServers([...mcpServers, server])
      setName('')
      setUrl('')
    } catch { /* silent */ } finally {
      setIsAdding(false)
    }
  }

  const toggleServer = async (id: string, enabled: boolean) => {
    try {
      await fetch(`/api/mcp/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      setMcpServers(mcpServers.map((s) => (s.id === id ? { ...s, enabled } : s)))
    } catch { /* silent */ }
  }

  const refreshTools = async (id: string) => {
    setRefreshing(id)
    try {
      const res = await fetch(`/api/mcp/${id}`, { method: 'POST' })
      const server = await res.json()
      setMcpServers(mcpServers.map((s) => (s.id === id ? server : s)))
    } catch { /* silent */ } finally {
      setRefreshing(null)
    }
  }

  const deleteServer = async (id: string) => {
    try {
      await fetch(`/api/mcp/${id}`, { method: 'DELETE' })
      setMcpServers(mcpServers.filter((s) => s.id !== id))
    } catch { /* silent */ }
  }

  const totalTools = mcpServers.filter((s) => s.enabled).reduce((acc, s) => acc + (s.tools?.length || 0), 0)

  return (
    <Dialog open={mcpOpen} onOpenChange={setMcpOpen}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>MCP Tools</DialogTitle>
          <DialogDescription>
            Connect to Model Context Protocol servers to give your AI access to tools and data.
            {totalTools > 0 && <span className="ml-1 font-medium text-foreground">{totalTools} tool(s) active</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add server */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Plug className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Add MCP Server</p>
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Web Search" />
            </div>
            <div className="space-y-2">
              <Label>Server URL (SSE endpoint)</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3001/mcp" />
            </div>
            <Button onClick={addServer} disabled={!name.trim() || !url.trim() || isAdding} className="w-full">
              {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add Server
            </Button>
          </div>

          {/* Server list */}
          {mcpServers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Connected Servers</p>
              {mcpServers.map((server) => (
                <div key={server.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{server.name}</span>
                        <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {server.tools?.length || 0} tools
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate ml-5.5">{server.url}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => refreshTools(server.id)}
                        disabled={refreshing === server.id}
                      >
                        {refreshing === server.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteServer(server.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-5.5">
                    <Switch
                      checked={server.enabled}
                      onCheckedChange={(v) => toggleServer(server.id, v)}
                    />
                    <Label className="text-xs">{server.enabled ? 'Enabled' : 'Disabled'}</Label>
                  </div>
                  {server.tools && server.tools.length > 0 && (
                    <div className="ml-5.5 space-y-0.5">
                      {server.tools.slice(0, 5).map((tool) => (
                        <p key={tool.name} className="text-[11px] text-muted-foreground">
                          <span className="font-mono bg-muted px-1 rounded">{tool.name}</span>
                          {tool.description && <span className="ml-1">— {tool.description.slice(0, 50)}</span>}
                        </p>
                      ))}
                      {server.tools.length > 5 && (
                        <p className="text-[10px] text-muted-foreground">
                          +{server.tools.length - 5} more tool(s)
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {mcpServers.length === 0 && (
            <div className="text-center py-6">
              <Wrench className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No MCP servers configured. Add a server to give your AI access to external tools.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}