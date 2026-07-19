const attempts = new Map<string, { count: number; firstAttempt: number; lockedUntil: number }>()
const WINDOW_MS = 15 * 60 * 1000 // 15 min
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

export function checkRateLimit(ip: string, username: string): { allowed: boolean; retryAfterMs: number } {
  const key = `${ip}:${username.toLowerCase()}`
  const now = Date.now()
  const entry = attempts.get(key)

  if (!entry) return { allowed: true, retryAfterMs: 0 }

  if (entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now }
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    attempts.delete(key)
    return { allowed: true, retryAfterMs: 0 }
  }

  return { allowed: entry.count < MAX_ATTEMPTS, retryAfterMs: 0 }
}

export function recordAttempt(ip: string, username: string, success: boolean) {
  const key = `${ip}:${username.toLowerCase()}`
  const now = Date.now()
  let entry = attempts.get(key)

  if (!entry) {
    entry = { count: 0, firstAttempt: now, lockedUntil: 0 }
    attempts.set(key, entry)
  }

  if (success) {
    attempts.delete(key)
    return
  }

  entry.count++

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS
  }
}

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of attempts) {
    if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
      attempts.delete(key)
    } else if (now - entry.firstAttempt > WINDOW_MS + LOCKOUT_MS) {
      attempts.delete(key)
    }
  }
}, 10 * 60 * 1000)