import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { execSync } from 'child_process'
import os from 'os'

const HOUND_PORT = process.env.HOUND_PORT || '8765'
const APP_PORT = process.env.APP_PORT || '3000'
const isWin = os.platform() === 'win32'

function killOnPort(port: string): number {
  const pids = new Set<string>()
  if (isWin) {
    try {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 5 && parts[1].endsWith(`:${port}`)) {
          pids.add(parts[4])
        }
      }
      for (const pid of pids) {
        if (pid && pid !== '0') {
          try { execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' }) } catch {}
        }
      }
      return pids.size
    } catch {
      return 0
    }
  } else {
    // Try lsof first
    try {
      const out = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' })
      for (const pid of out.split('\n').map((s) => s.trim()).filter(Boolean)) {
        pids.add(pid)
      }
    } catch {}
    // Fallback: ss
    if (pids.size === 0) {
      try {
        const out = execSync(`ss -lptn 'sport = :${port}' 2>/dev/null`, { encoding: 'utf8' })
        for (const m of out.matchAll(/pid=(\d+)/g)) {
          pids.add(m[1])
        }
      } catch {}
    }
    // Fallback: fuser
    if (pids.size === 0) {
      try {
        const out = execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: 'utf8' })
        for (const pid of out.split(/\s+/).map((s) => s.trim()).filter(Boolean)) {
          pids.add(pid)
        }
      } catch {}
    }
    let killed = 0
    for (const pid of pids) {
      try {
        process.kill(parseInt(pid, 10), 'SIGTERM')
        killed++
      } catch {}
    }
    return killed
  }
}

// POST /api/admin/stop-server — admin-only: stops Hound + Next.js.
// Returns immediately with a success message; the actual kill happens
// asynchronously 500ms later so the response can be sent first.
export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error

  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  // Schedule the kill for 500ms in the future so this response can be sent
  // before the Next.js process dies.
  setTimeout(() => {
    try {
      killOnPort(HOUND_PORT)
      killOnPort(APP_PORT)
    } catch {
      // ignore — we're exiting anyway
    }
  }, 500)

  return NextResponse.json({
    success: true,
    message: 'Stopping Hound and Next.js. The server will shut down in ~1 second.',
  })
}
