'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { Cpu, Loader2, Eye, EyeOff, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type AuthMode = 'checking' | 'setup' | 'login'

export function AuthView() {
  const [mode, setMode] = useState<AuthMode>('checking')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Check if accounts exist on mount
  useEffect(() => {
    fetch('/api/auth/setup')
      .then((r) => r.json())
      .then((data) => {
        setMode(data.hasAccounts ? 'login' : 'setup')
      })
      .catch(() => setMode('login'))
  }, [])

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create account')
        setLoading(false)
        return
      }

      // Account created, now sign in
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Account created but sign-in failed. Please try logging in.')
        setMode('login')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid username or password')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    )
  }

  const isSetup = mode === 'setup'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Cpu className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">LM Studio Chat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSetup
              ? 'Create your account to get started'
              : 'Sign in to access your AI chat'}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              {isSetup && <Shield className="h-4 w-4" />}
              {isSetup ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription className="text-xs">
              {isSetup
                ? 'This account will be used to protect access to your LM Studio chat.'
                : 'Enter your credentials to continue.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={isSetup ? handleSetup : handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder={isSetup ? 'Choose a username' : 'Enter your username'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  autoComplete="username"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isSetup ? 'Create a password' : 'Enter your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={isSetup ? 'new-password' : 'current-password'}
                    disabled={loading}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              {isSetup && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSetup ? 'Create Account' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Secured with scrypt password hashing
        </p>
      </div>
    </div>
  )
}