#!/usr/bin/env node
/**
 * Orchestrator: starts Hound MCP (if installed) and the Next.js app together.
 *
 * - Probes port 8765 first; if something is already listening (e.g. a
 *   leftover Hound process from a previous run, or another tool that
 *   installed Hound), it uses that one instead of spawning a duplicate.
 * - Spawns Hound in the background (port 8765 by default) only if not
 *   already running.
 * - Spawns Next.js in the foreground.
 * - Forwards stdout/stderr from both, with [hound] / [next] prefixes.
 * - On Ctrl+C: kills only the Hound process *we* spawned. If Hound was
 *   already running before us, we leave it alone (so we don't kill a
 *   process the user started independently).
 * - If either process exits, kills the other cleanly.
 * - If Hound is not installed and not already running, continues with
 *   Next.js only.
 *
 * Usage:
 *   node scripts/start-all.js              # production (next start -p 3000)
 *   node scripts/start-all.js dev          # dev mode (next dev -p 3000)
 *   HOUND_PORT=9000 node scripts/start-all.js
 *
 * Env vars:
 *   HOUND_PORT   — port for Hound (default 8765)
 *   HOUND_HOST   — host for Hound (default 127.0.0.1)
 *   APP_PORT     — port for Next.js (default 3000)
 *   SKIP_HOUND=1 — skip launching Hound even if installed
 */

const { spawn, execSync } = require('child_process')
const http = require('http')
const isWin = process.platform === 'win32'

const MODE = process.argv[2] || 'start' // 'start' or 'dev'
const HOUND_PORT = process.env.HOUND_PORT || '8765'
const HOUND_HOST = process.env.HOUND_HOST || '127.0.0.1'
const APP_PORT = process.env.APP_PORT || '3000'
const SKIP_HOUND = process.env.SKIP_HOUND === '1'

let houndProc = null
let nextProc = null
let weStartedHound = false
let shuttingDown = false

function prefix(name, chunk) {
  const text = chunk.toString()
  for (const line of text.split('\n')) {
    if (line === '') continue
    process.stdout.write(`[${name}] ${line}\n`)
  }
}

/** Probe an HTTP endpoint, returns true if it responds. */
function probePort(host, port, path = '/mcp') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host,
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': '2' },
        timeout: 2000,
      },
      (res) => {
        res.resume()
        resolve(res.statusCode !== undefined)
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.write('{}')
    req.end()
  })
}

/** Try to find and kill any process listening on a given port. */
function killProcessOnPort(port) {
  let killed = 0
  const pids = new Set()

  try {
    if (isWin) {
      // netstat -ano | findstr :8765 → last column is PID
      try {
        const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' })
        for (const line of out.split('\n')) {
          const parts = line.trim().split(/\s+/)
          if (parts.length >= 5 && parts[1].endsWith(`:${port}`)) {
            pids.add(parts[4])
          }
        }
      } catch {}
      for (const pid of pids) {
        if (pid && pid !== '0') {
          try {
            execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' })
            killed++
            console.log(`[orchestrator] Killed PID ${pid} on port ${port}`)
          } catch {}
        }
      }
      return killed
    } else {
      // Try lsof first (most common on macOS/Linux)
      try {
        const out = execSync(`lsof -ti :${port} 2>/dev/null`, { encoding: 'utf8' })
        for (const pid of out.split('\n').map((s) => s.trim()).filter(Boolean)) {
          pids.add(pid)
        }
      } catch {}

      // Also try ss (common on modern Linux) if lsof found nothing
      if (pids.size === 0) {
        try {
          const out = execSync(`ss -lptn 'sport = :${port}' 2>/dev/null`, { encoding: 'utf8' })
          // Output looks like: ... users:(("next-server",pid=12345,fd=20))
          const pidMatches = out.matchAll(/pid=(\d+)/g)
          for (const m of pidMatches) {
            pids.add(m[1])
          }
        } catch {}
      }

      // Also try fuser as a last resort
      if (pids.size === 0) {
        try {
          const out = execSync(`fuser ${port}/tcp 2>/dev/null`, { encoding: 'utf8' })
          for (const pid of out.split(/\s+/).map((s) => s.trim()).filter(Boolean)) {
            pids.add(pid)
          }
        } catch {}
      }

      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), 'SIGTERM')
          killed++
          console.log(`[orchestrator] Killed PID ${pid} on port ${port}`)
        } catch {}
      }
      return killed
    }
  } catch {
    return killed
  }
}

function startHound() {
  if (SKIP_HOUND) {
    console.log('[orchestrator] SKIP_HOUND=1 set, not launching Hound.')
    return null
  }
  console.log('[orchestrator] Starting Hound MCP...')
  const proc = spawn('hound', ['--http', '--host', HOUND_HOST, '--port', HOUND_PORT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWin,
    env: { ...process.env },
  })

  let announced = false

  proc.stdout.on('data', (chunk) => {
    prefix('hound', chunk)
    const text = chunk.toString()
    if (!announced && text.includes('Uvicorn running on')) {
      announced = true
      console.log('')
      console.log('══════════════════════════════════════════════════════════════════')
      console.log(`  Hound MCP ready at  http://${HOUND_HOST}:${HOUND_PORT}/mcp`)
      console.log('  Click "Add to MCP" in the chat app\'s MCP Tools dialog.')
      console.log('══════════════════════════════════════════════════════════════════')
      console.log('')
    }
  })

  proc.stderr.on('data', (chunk) => prefix('hound', chunk))

  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.log('[orchestrator] Hound is not installed — skipping. Install with: npm run install:hound')
    } else {
      console.log(`[orchestrator] Failed to start Hound: ${err.message}`)
    }
  })

  proc.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[orchestrator] Hound exited (code=${code}, signal=${signal}). Continuing with Next.js only.`)
    }
  })

  return proc
}

function startNext() {
  const cmd = isWin ? 'npx.cmd' : 'npx'
  const args = MODE === 'dev' ? ['next', 'dev', '-p', APP_PORT] : ['next', 'start', '-p', APP_PORT]
  console.log(`[orchestrator] Starting Next.js (${MODE}) on port ${APP_PORT}...`)
  const proc = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    env: { ...process.env },
  })

  proc.stdout.on('data', (chunk) => prefix('next', chunk))
  proc.stderr.on('data', (chunk) => prefix('next', chunk))

  proc.on('error', (err) => {
    console.error(`[orchestrator] Failed to start Next.js: ${err.message}`)
    shutdown(1)
  })

  proc.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.log(`[orchestrator] Next.js exited (code=${code}, signal=${signal}).`)
    }
    shutdown(code ?? 0)
  })

  return proc
}

function shutdown(exitCode) {
  if (shuttingDown) return
  shuttingDown = true
  console.log('[orchestrator] Shutting down...')

  // Only kill Hound if we started it. If it was already running before us,
  // leave it alone — the user may have started it independently.
  if (weStartedHound && houndProc && !houndProc.killed) {
    console.log('[orchestrator] Stopping Hound (we started it)...')
    try { houndProc.kill(isWin ? 'SIGTERM' : 'SIGINT') } catch {}
  } else if (houndProc && !weStartedHound) {
    console.log('[orchestrator] Leaving Hound running (we did not start it).')
  }
  if (nextProc && !nextProc.killed) {
    try { nextProc.kill(isWin ? 'SIGTERM' : 'SIGINT') } catch {}
  }

  // Give them a moment, then force kill if still alive
  setTimeout(() => {
    if (weStartedHound && houndProc && !houndProc.killed) {
      try { houndProc.kill('SIGKILL') } catch {}
    }
    if (nextProc && !nextProc.killed) {
      try { nextProc.kill('SIGKILL') } catch {}
    }
    process.exit(exitCode)
  }, 1500)
}

// Forward Ctrl+C
process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// Parse --kill-hound flag: find and kill whatever is on port 8765, then exit.
if (process.argv.includes('--kill-hound')) {
  console.log(`[orchestrator] Killing any process on port ${HOUND_PORT} (Hound)...`)
  const count = killProcessOnPort(HOUND_PORT)
  if (count > 0) {
    console.log(`[orchestrator] Killed ${count} process(es) on port ${HOUND_PORT}.`)
  } else {
    console.log(`[orchestrator] No process found on port ${HOUND_PORT}.`)
  }
  process.exit(0)
}

// Parse --kill-all flag: kill Hound (port 8765) AND Next.js (port 3000), then exit.
if (process.argv.includes('--kill-all') || process.argv.includes('--stop-all')) {
  console.log(`[orchestrator] Stopping everything (Hound on ${HOUND_PORT} + Next.js on ${APP_PORT})...`)
  const houndCount = killProcessOnPort(HOUND_PORT)
  const nextCount = killProcessOnPort(APP_PORT)
  console.log(`[orchestrator] Hound: killed ${houndCount} process(es) on port ${HOUND_PORT}.`)
  console.log(`[orchestrator] Next.js: killed ${nextCount} process(es) on port ${APP_PORT}.`)
  if (houndCount === 0 && nextCount === 0) {
    console.log('[orchestrator] Nothing was running.')
  } else {
    console.log('[orchestrator] All services stopped.')
  }
  process.exit(0)
}

// Parse --kill-next flag: kill only Next.js (port 3000), leave Hound alone.
if (process.argv.includes('--kill-next')) {
  console.log(`[orchestrator] Killing any process on port ${APP_PORT} (Next.js)...`)
  const count = killProcessOnPort(APP_PORT)
  if (count > 0) {
    console.log(`[orchestrator] Killed ${count} process(es) on port ${APP_PORT}.`)
  } else {
    console.log(`[orchestrator] No process found on port ${APP_PORT}.`)
  }
  process.exit(0)
}

// Start both
console.log('══════════════════════════════════════════════════════════════════')
console.log('  LM Studio Chat — starting (with Hound MCP if available)')
console.log('══════════════════════════════════════════════════════════════════')
console.log('')

;(async () => {
  // First, probe the Hound port. If something is already listening, use it
  // instead of spawning a duplicate.
  if (!SKIP_HOUND) {
    console.log(`[orchestrator] Checking if Hound is already running on port ${HOUND_PORT}...`)
    const alreadyRunning = await probePort(HOUND_HOST, HOUND_PORT)
    if (alreadyRunning) {
      console.log(`[orchestrator] Hound is already running at http://${HOUND_HOST}:${HOUND_PORT}/mcp — using it.`)
      console.log('[orchestrator] (We did not start it, so Ctrl+C will NOT stop it.)')
      weStartedHound = false
    } else {
      houndProc = startHound()
      weStartedHound = !!houndProc
    }
  } else {
    console.log('[orchestrator] SKIP_HOUND=1 — not launching Hound.')
  }

  // Small delay so Hound logs come before Next.js logs
  setTimeout(() => {
    nextProc = startNext()
  }, 500)
})()
