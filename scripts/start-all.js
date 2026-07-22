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
const fs = require('fs')
const path = require('path')
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

/**
 * Find the hound executable. Returns { cmd, args, shell } where:
 *   - cmd: the command to spawn (full path or 'python')
 *   - args: prefix args to pass before the hound args
 *   - shell: whether spawn should use shell:true
 *
 * Tries in order:
 *   1. 'where hound' (Windows) / 'which hound' (Unix) → full path, no shell
 *   2. Common Python Scripts directories (Windows only)
 *   3. 'python -m hound_mcp' (works if package installed, even if script not on PATH)
 *   4. 'hound' via shell (last resort, triggers DEP0190 warning)
 */
function findHoundExecutable() {
  // 1. Try `where`/`which` to resolve the full path (avoids shell:true)
  try {
    const which = isWin ? 'where hound' : 'which hound'
    const out = execSync(which, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
    if (out) {
      // `where` may return multiple lines; take the first
      const first = out.split('\n')[0].trim()
      if (first && fs.existsSync(first)) {
        return { cmd: first, args: [], shell: false }
      }
    }
  } catch {}

  // 2. On Windows, search common install locations for hound.exe
  if (isWin) {
    const candidates = []
    const appdata = process.env.APPDATA || ''
    const localappdata = process.env.LOCALAPPDATA || ''
    const userprofile = process.env.USERPROFILE || ''
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files'

    if (appdata) {
      candidates.push(path.join(appdata, 'Python', 'Scripts', 'hound.exe'))
    }
    if (userprofile) {
      candidates.push(path.join(userprofile, 'AppData', 'Roaming', 'Python', 'Scripts', 'hound.exe'))
      for (const ver of ['Python313', 'Python312', 'Python311', 'Python310', 'Python39']) {
        candidates.push(path.join(userprofile, 'AppData', 'Roaming', 'Python', ver, 'Scripts', 'hound.exe'))
      }
    }
    if (localappdata) {
      for (const ver of ['Python313', 'Python312', 'Python311', 'Python310', 'Python39']) {
        candidates.push(path.join(localappdata, 'Programs', 'Python', ver, 'Scripts', 'hound.exe'))
      }
    }
    for (const root of ['C:\\', programFiles]) {
      for (const ver of ['Python313', 'Python312', 'Python311', 'Python310', 'Python39']) {
        candidates.push(path.join(root, ver, 'Scripts', 'hound.exe'))
      }
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return { cmd: candidate, args: [], shell: false }
        }
      } catch {}
    }
  }

  // 3. Try `python -m master_fetch` — works if the package is installed even
  //    when the hound.exe script isn't on PATH. The PyPI package is
  //    'hound-mcp' but the import name is 'master_fetch'.
  const pythonCmd = isWin ? 'python' : 'python3'
  try {
    execSync(`${pythonCmd} -c "import master_fetch"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
    // Package is importable — use module invocation
    return { cmd: pythonCmd, args: ['-m', 'master_fetch'], shell: false }
  } catch {}

  // 4. Last resort: 'hound' via shell (may trigger DEP0190 warning)
  return { cmd: 'hound', args: [], shell: isWin }
}

function startHound() {
  if (SKIP_HOUND) {
    console.log('[orchestrator] SKIP_HOUND=1 set, not launching Hound.')
    return null
  }

  const { cmd: houndCmd, args: houndArgs, shell: useShell } = findHoundExecutable()
  const houndFullArgs = [...houndArgs, '--http', '--host', HOUND_HOST, '--port', HOUND_PORT]
  console.log(`[orchestrator] Starting Hound MCP (${houndCmd} ${houndArgs.join(' ')})...`)
  const proc = spawn(houndCmd, houndFullArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: useShell,
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
      console.log('[orchestrator] Hound is not installed or not on PATH — skipping.')
      console.log('[orchestrator] Install it with: npm run install:hound')
      console.log('[orchestrator] Or manually: pip install hound-mcp[all] && playwright install chromium')
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
  const nextArgs = MODE === 'dev' ? ['dev', '-p', APP_PORT] : ['start', '-p', APP_PORT]
  console.log(`[orchestrator] Starting Next.js (${MODE}) on port ${APP_PORT}...`)

  // Invoke the Next.js CLI directly via node, bypassing npx entirely.
  // This avoids the Windows .cmd spawn issue (EINVAL) and the DEP0190
  // deprecation warning from shell:true with args.
  // Path: node_modules/next/dist/bin/next (defined in next's package.json "bin")
  const nextCliPath = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next')

  if (!fs.existsSync(nextCliPath)) {
    console.error(`[orchestrator] Next.js CLI not found at ${nextCliPath}`)
    console.error('[orchestrator] Run "npm install" first.')
    shutdown(1)
    return null
  }

  const proc = spawn(process.execPath, [nextCliPath, ...nextArgs], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,  // no shell needed — we're invoking node directly
    env: { ...process.env },
  })

  proc.stdout.on('data', (chunk) => prefix('next', chunk))
  proc.stderr.on('data', (chunk) => prefix('next', chunk))

  proc.on('error', (err) => {
    console.error(`[orchestrator] Failed to start Next.js: ${err.message}`)
    if (isWin && err.code === 'EINVAL') {
      console.error('[orchestrator] This is a Windows spawn issue. Try running "npx next start -p 3000" directly to verify npm/npx works.')
    }
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
