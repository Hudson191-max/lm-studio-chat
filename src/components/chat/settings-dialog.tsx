'use client'

import { useState, useEffect, useCallback } from 'react'
import { useChatStore } from '@/store/chat-store'
import { useTheme } from 'next-themes'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Wifi, WifiOff, RefreshCw, Loader2, Sun, Moon, Monitor, Info } from 'lucide-react'
import { formatTokens as formatTokenCount } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'

interface ModelInfo {
  id: string
  contextLength?: number
}

const DEFAULT_MAX_TOKENS = 2048
const MIN_TOKENS = 256

export function SettingsDialog() {
  const settingsOpen = useChatStore((s) => s.settingsOpen)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const { toast } = useToast()
  const isConnected = useChatStore((s) => s.isConnected)
  const availableModels = useChatStore((s) => s.availableModels)
  const selectedModel = useChatStore((s) => s.selectedModel)
  const setSelectedModel = useChatStore((s) => s.setSelectedModel)
  const setConnected = useChatStore((s) => s.setConnected)
  const setAvailableModels = useChatStore((s) => s.setAvailableModels)
  const { theme, setTheme } = useTheme()

  const [url, setUrl] = useState('http://localhost:1234/v1')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS)
  const [maxContext, setMaxContext] = useState<number | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [modelDetails, setModelDetails] = useState<ModelInfo[]>([])

  useEffect(() => {
    if (settingsOpen) {
      fetch('/api/settings')
        .then((res) => res.json())
        .then((data) => {
          if (data.lmStudioUrl) setUrl(data.lmStudioUrl)
          if (data.lmStudioModel) setSelectedModel(data.lmStudioModel)
          if (data.temperature) setTemperature(parseFloat(data.temperature))
          if (data.maxTokens) setMaxTokens(parseInt(data.maxTokens))
        })
        .catch(() => {})
    }
  }, [settingsOpen, setSelectedModel])

  const checkConnection = useCallback(async () => {
    setIsChecking(true)
    try {
      const res = await fetch('/api/status')
      const data = await res.json()
      setConnected(data.connected)
      const models: ModelInfo[] = data.models || []
      setAvailableModels(models.map((m) => m.id))
      setModelDetails(models)
      // Populate context lengths map for token usage display
      const ctxMap: Record<string, number> = {}
      for (const m of models) {
        if (m.contextLength) ctxMap[m.id] = m.contextLength
      }
      useChatStore.getState().setModelContextLengths(ctxMap)
      if (models.length > 0 && !selectedModel) {
        setSelectedModel(models[0].id)
      }
    } catch {
      setConnected(false)
    } finally {
      setIsChecking(false)
    }
  }, [setConnected, setAvailableModels, setSelectedModel, selectedModel])

  useEffect(() => {
    if (settingsOpen) checkConnection()
  }, [settingsOpen, checkConnection])

  useEffect(() => {
    if (!selectedModel || modelDetails.length === 0) return
    const info = modelDetails.find((m) => m.id === selectedModel)
    if (info?.contextLength) {
      setMaxContext(info.contextLength)
      if (maxTokens > info.contextLength) {
        setMaxTokens(info.contextLength)
      }
    } else {
      setMaxContext(null)
    }
  }, [selectedModel, modelDetails, maxTokens])

  const sliderMax = maxContext ? Math.min(maxContext, 1048576) : 131072
  const sliderStep = sliderMax > 32768 ? 1024 : sliderMax > 8192 ? 512 : 256

  const saveSettings = async () => {
    setIsSaving(true)
    setSaved(false)
    try {
      const items = [
        { key: 'lmStudioUrl', value: url },
        { key: 'lmStudioModel', value: selectedModel },
        { key: 'temperature', value: temperature.toString() },
        { key: 'maxTokens', value: maxTokens.toString() },
      ]
      await Promise.all(
        items.map((s) =>
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s),
          })
        )
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      toast({ title: 'Settings saved', description: 'LM Studio connection updated.' })
      await checkConnection()
    } catch { /* silent */ } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Configure your LM Studio connection and appearance.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Theme */}
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex gap-2">
              {([
                { value: 'light', icon: Sun, label: 'Light' },
                { value: 'dark', icon: Moon, label: 'Dark' },
                { value: 'system', icon: Monitor, label: 'System' },
              ] as const).map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  variant={theme === value ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setTheme(value)}
                >
                  <Icon className="h-3.5 w-3.5 mr-1.5" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Connection Status */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-emerald-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-destructive" />
              )}
              <span className="text-sm font-medium">
                {isConnected ? 'Connected to LM Studio' : 'Not connected'}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={checkConnection} disabled={isChecking}>
              {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              <span className="ml-1.5">Test</span>
            </Button>
          </div>

          {/* Server URL */}
          <div className="space-y-2">
            <Label htmlFor="url">LM Studio Server URL</Label>
            <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:1234/v1" />
            <p className="text-xs text-muted-foreground">
              The base URL of your LM Studio local server API.
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
              <SelectContent>
                {availableModels.length === 0 ? (
                  <SelectItem value="default" disabled>No models found - check connection</SelectItem>
                ) : (
                  availableModels.map((model) => {
                    const info = modelDetails.find((m) => m.id === model)
                    const ctxLabel = info?.contextLength ? ` (${formatTokenCount(info.contextLength)} ctx)` : ''
                    return (
                      <SelectItem key={model} value={model}>
                        {model}{ctxLabel}
                      </SelectItem>
                    )
                  })
                )}
              </SelectContent>
            </Select>
            {maxContext && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Info className="h-3 w-3 shrink-0" />
                Detected context window: <span className="font-medium text-foreground">{formatTokenCount(maxContext)} tokens</span>
              </p>
            )}
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider value={[temperature]} onValueChange={(v) => setTemperature(v[0])} min={0} max={2} step={0.1} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label>Max Tokens</Label>
                {maxContext && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    {formatTokenCount(maxContext)} max
                  </span>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {formatTokenCount(maxTokens)}
                {maxContext && <span className="text-xs ml-1">/ {formatTokenCount(maxContext)}</span>}
              </span>
            </div>
            <Slider
              value={[maxTokens]}
              onValueChange={(v) => setMaxTokens(v[0])}
              min={MIN_TOKENS}
              max={sliderMax}
              step={sliderStep}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatTokenCount(MIN_TOKENS)}</span>
              <span>{formatTokenCount(sliderMax)}</span>
            </div>
            {maxContext && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setMaxTokens(maxContext)}
              >
                Set to max ({formatTokenCount(maxContext)})
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved!</span>}
          <Button onClick={saveSettings} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save Settings
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
