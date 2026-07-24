'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Check, Plus, Trash2, Settings2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface CatalogEntry {
  catalogId: string
  name: string
  description: string
  category: string
  icon: string
  configRequired: boolean
  runtime: string
  configFields?: Array<{
    key: string
    label: string
    type: string
    placeholder?: string
    help?: string
    required: boolean
  }>
}

interface CatalogEntryWithStatus extends CatalogEntry {
  enabled: boolean
  port: number | null
  hasConfig: boolean
}

export function MarketplaceTab() {
  const { data: session } = useSession()
  const { toast } = useToast()
  const isAdmin = session?.user?.role === 'admin'

  const [catalog, setCatalog] = useState<CatalogEntryWithStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [configuring, setConfiguring] = useState<string | null>(null)
  const [configValues, setConfigValues] = useState<Record<string, string>>({})

  const loadCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/marketplace')
      const data = await res.json()
      setCatalog(data.catalog || [])
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCatalog()
  }, [loadCatalog])

  const handleEnable = async (entry: CatalogEntryWithStatus) => {
    if (entry.configRequired && !entry.hasConfig) {
      // Open the configure dialog first
      setConfiguring(entry.catalogId)
      setConfigValues({})
      return
    }
    setToggling(entry.catalogId)
    try {
      const res = await fetch(`/api/marketplace/${entry.catalogId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Failed to enable', description: data.error, variant: 'destructive' })
        return
      }
      toast({
        title: `${entry.name} enabled`,
        description: 'Restart the app to activate this server.',
      })
      loadCatalog()
    } catch {
      toast({ title: 'Failed to enable', variant: 'destructive' })
    } finally {
      setToggling(null)
    }
  }

  const handleDisable = async (catalogId: string, name: string) => {
    setToggling(catalogId)
    try {
      await fetch(`/api/marketplace/${catalogId}`, { method: 'DELETE' })
      toast({ title: `${name} disabled`, description: 'Restart the app to stop the server.' })
      loadCatalog()
    } catch {
      toast({ title: 'Failed to disable', variant: 'destructive' })
    } finally {
      setToggling(null)
    }
  }

  const handleSaveConfig = async (entry: CatalogEntryWithStatus) => {
    // Validate required fields
    for (const field of entry.configFields || []) {
      if (field.required && !configValues[field.key]) {
        toast({ title: 'Missing required field', description: field.label, variant: 'destructive' })
        return
      }
    }

    setToggling(entry.catalogId)
    try {
      const res = await fetch(`/api/marketplace/${entry.catalogId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configValues }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Failed to save config', description: data.error, variant: 'destructive' })
        return
      }
      toast({ title: `${entry.name} configured + enabled`, description: 'Restart the app to activate.' })
      setConfiguring(null)
      loadCatalog()
    } catch {
      toast({ title: 'Failed to save config', variant: 'destructive' })
    } finally {
      setToggling(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Group by category
  const categories = ['web', 'knowledge', 'productivity', 'developer', 'data']
  const categoryLabels: Record<string, string> = {
    web: 'Web & Search',
    knowledge: 'Knowledge & Memory',
    productivity: 'Productivity',
    developer: 'Developer Tools',
    data: 'Data',
  }

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-2 text-xs text-yellow-600 dark:text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Only admins can enable/disable marketplace servers. Ask an admin to add servers.</span>
        </div>
      )}

      {categories.map((cat) => {
        const entries = catalog.filter((e) => e.category === cat)
        if (entries.length === 0) return null
        return (
          <div key={cat} className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {categoryLabels[cat] || cat}
            </p>
            <div className="grid gap-2">
              {entries.map((entry) => (
                <div
                  key={entry.catalogId}
                  className={`rounded-lg border p-3 space-y-2 ${
                    entry.enabled ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <span className="text-xl shrink-0">{entry.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium">{entry.name}</p>
                          {entry.configRequired && (
                            <span className="flex items-center gap-0.5 text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                              <AlertTriangle className="h-2.5 w-2.5" /> Setup required
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {entry.runtime}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                        {entry.enabled && entry.port && (
                          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                            :{entry.port}/mcp
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      {entry.enabled ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-destructive hover:text-destructive"
                          onClick={() => handleDisable(entry.catalogId, entry.name)}
                          disabled={!isAdmin || toggling === entry.catalogId}
                        >
                          {toggling === entry.catalogId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEnable(entry)}
                          disabled={!isAdmin || toggling === entry.catalogId}
                        >
                          {toggling === entry.catalogId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : entry.configRequired ? (
                            <Settings2 className="h-3.5 w-3.5 mr-1" />
                          ) : (
                            <Plus className="h-3.5 w-3.5 mr-1" />
                          )}
                          {entry.configRequired ? 'Configure' : 'Add'}
                        </Button>
                      )}
                    </div>
                  </div>
                  {entry.enabled && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3" />
                      <span>Enabled — restart the app to {entry.port ? 'activate' : 'start'} this server.</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Configuration dialog for entries that need setup (e.g. Google Calendar) */}
      <Dialog open={!!configuring} onOpenChange={(v) => !v && setConfiguring(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Configure {catalog.find((e) => e.catalogId === configuring)?.name}</DialogTitle>
            <DialogDescription>
              This server requires credentials before it can be enabled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {catalog.find((e) => e.catalogId === configuring)?.configFields?.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={`config-${field.key}`} className="text-xs">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                <Input
                  id={`config-${field.key}`}
                  type={field.type === 'password' ? 'password' : 'text'}
                  placeholder={field.placeholder}
                  value={configValues[field.key] || ''}
                  onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.value })}
                />
                {field.help && (
                  <p className="text-[10px] text-muted-foreground">{field.help}</p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfiguring(null)}>Cancel</Button>
            <Button
              onClick={() => {
                const entry = catalog.find((e) => e.catalogId === configuring)
                if (entry) handleSaveConfig(entry)
              }}
              disabled={toggling === configuring}
            >
              {toggling === configuring && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save & Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
