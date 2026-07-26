'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/store/chat-store'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Loader2, Star } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export function ProfilesDialog() {
  const profilesOpen = useChatStore((s) => s.profilesOpen)
  const setProfilesOpen = useChatStore((s) => s.setProfilesOpen)
  const profiles = useChatStore((s) => s.profiles)
  const setProfiles = useChatStore((s) => s.setProfiles)
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [url, setUrl] = useState('http://localhost:1234/v1')
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [isDefault, setIsDefault] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (profilesOpen) {
      fetch('/api/profiles')
        .then((r) => r.json())
        .then((data) => setProfiles(Array.isArray(data) ? data : []))
        .catch(() => {})
    }
  }, [profilesOpen, setProfiles])

  const createProfile = async () => {
    if (!name.trim() || isSaving) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, model, temperature, maxTokens, isDefault }),
      })
      const profile = await res.json()
      setProfiles([...profiles, profile])
      setName('')
      setModel('')
      setIsDefault(false)
      toast({ title: 'Profile created', description: `"${profile.name}" is ready to use.` })
    } catch { /* silent */ } finally {
      setIsSaving(false)
    }
  }

  const deleteProfile = async (id: string) => {
    try {
      await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      setProfiles(profiles.filter((p) => p.id !== id))
      toast({ title: 'Profile deleted' })
    } catch { /* silent */ }
  }

  return (
    <Dialog open={profilesOpen} onOpenChange={setProfilesOpen}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Model Profiles</DialogTitle>
          <DialogDescription>
            Save different LM Studio configurations and switch between them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new profile */}
          <div className="rounded-lg border p-3 space-y-3">
            <p className="text-sm font-medium">Create Profile</p>
            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Local LLM" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-url">Server URL</Label>
              <Input id="profile-url" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-model">Model (optional)</Label>
              <Input id="profile-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Auto-detect" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Temperature</Label>
                <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
              </div>
              <Slider value={[temperature]} onValueChange={(v) => setTemperature(v[0])} min={0} max={2} step={0.1} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Max Tokens</Label>
                <span className="text-xs text-muted-foreground">{maxTokens}</span>
              </div>
              <Slider value={[maxTokens]} onValueChange={(v) => setMaxTokens(v[0])} min={256} max={8192} step={256} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <Label className="text-sm">Set as default</Label>
            </div>
            <Button onClick={createProfile} disabled={!name.trim() || isSaving} className="w-full">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Profile
            </Button>
          </div>

          {/* Existing profiles */}
          {profiles.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Saved Profiles</p>
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border p-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      {p.isDefault && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{p.url} {p.model ? `| ${p.model}` : ''}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteProfile(p.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}