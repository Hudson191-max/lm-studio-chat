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
import { Wifi, WifiOff, RefreshCw, Loader2, Sun, Moon, Monitor } from 'lucide-react'

export function SettingsDialog() {
  const settingsOpen = useChatStore((s) => s.settingsOpen)
  const setSettingsOpen = useChatStore((s) => s.setSettingsOpen)
  const isConnected = useChatStore((s) => s.isConnected)
  const availableModels = useChatStore((s) => s.availableModels)
  const selectedModel = useChatStore((s) => s.selectedModel)
  const setSelectedModel = useChatStore((s) => s.setSelectedModel)
  const setConnected = useChatStore((s) => s.setConnected)
  const setAvailableModels = useChatStore((s) => s.setAvailableModels)
  const { theme, setTheme } = useTheme()

  const [url, setUrl] = useState('http://localhost:1234/v1')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [isChecking, setIsChecking] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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
      setAvailableModels(data.models || [])
      if (data.models?.length > 0 && !selectedModel) {
        setSelectedModel(data.models[0])
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

  const saveSettings = async () => {
    setIsSaving(true)
    setSaved(false)
    try {
      const settings = [
        { key: 'lmStudioUrl', value: url },
        { key: 'lmStudioModel', value: selectedModel },
        { key: 'temperature', value: temperature.toString() },
        { key: 'maxTokens', value: maxTokens.toString() },
      ]
      await Promise.all(
        settings.map((s) =>
          fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(s),
          })
        )
      )
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
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
              {[
                { value: 'light', icon: Sun, label: 'Light' },
                { value: 'dark', icon: Moon, label: 'Dark' },
                { value: 'system', icon: Monitor, label: 'System' },
              ].map(({ value, icon: Icon, label }) => (
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
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger><SelectValue placeholder="Select a model" /></SelectTrigger>
              <SelectContent>
                {availableModels.length === 0 ? (
                  <SelectItem value="default" disabled>No models found</SelectItem>
                ) : (
                  availableModels.map((model) => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
            <Slider value={[temperature]} onValueChange={(v) => setTemperature(v[0])} min={0} max={2} step={0.1} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Precise</span><span>Creative</span>
            </div>
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Max Tokens</Label>
              <span className="text-sm text-muted-foreground">{maxTokens}</span>
            </div>
            <Slider value={[maxTokens]} onValueChange={(v) => setMaxTokens(v[0])} min={256} max={8192} step={256} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>256</span><span>8192</span>
            </div>
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