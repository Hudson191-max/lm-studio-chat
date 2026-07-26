import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { execSync } from 'child_process'
import os from 'os'

const HOUND_PORT = process.env.HOUND_PORT || '8765'
const isWin = os.platform() === 'win32'

// POST /api/mcp/stop-hound — kills whatever process is listening on the
// Hound port (8765 by default). Admin-only since killing processes is
// a privileged action. Returns the number of processes killed.
export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error

  // Only admins can stop Hound (it's a system process, not per-user)
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  let killed = 0
  let detail = ''

  try {
    if (isWin) {
      try {
        const out = execSync(`netstat -ano | findstr :${HOUND_PORT}`, { encoding: 'utf8' })
        const pids = new Set<string>()
        for (const line of out.split('\n')) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 5 && parts[1].endsWith(`:${HOUND_PORT}`)) {
            pids.add(parts[4])
          }
        }
        for (const pid of pids) {
          if (pid && pid !== '0') {
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
              killed++
            } catch {}
          }
        }
        detail = `Found ${pids.size} process(es) on port ${HOUND_PORT}`
      } catch {
        detail = `No process found on port ${HOUND_PORT}`
      }
    } else {
      try {
        const out = execSync(`lsof -ti :${HOUND_PORT} 2>/dev/null`, { encoding: 'utf8' })
        const pids = out.split('\n').map((s) => s.trim()).filter(Boolean)
        for (const pid of pids) {
          try {
            process.kill(parseInt(pid, 10), 'SIGTERM')
            killed++
          } catch {}
        }
        detail = `Found ${pids.length} process(es) on port ${HOUND_PORT}`
      } catch {
        detail = `No process found on port ${HOUND_PORT}`
      }
    }

    return NextResponse.json({ success: true, killed, detail })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to stop Hound', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
