#!/usr/bin/env node
/**
 * Orchestrator: starts Hound MCP (if installed) and the Next.js app together.
 *
 * - Spawns Hound in the background (port 8765 by default).
 * - Spawns Next.js in the foreground.
 * - Forwards stdout/stderr from both, with [hound] / [next] prefixes.
 * - On Ctrl+C, or if either process exits, kills the other cleanly.
 * - If Hound is not installed, prints a hint and continues with Next.js only.
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

const { spawn } = require('child_process')
const isWin = process.platform === 'win32'

const MODE = process.argv[2] || 'start' // 'start' or 'dev'
const HOUND_PORT = process.env.HOUND_PORT || '8765'
const HOUND_HOST = process.env.HOUND_HOST || '127.0.0.1'
const APP_PORT = process.env.APP_PORT || '3000'
const SKIP_HOUND = process.env.SKIP_HOUND === '1'

let houndProc = null
let nextProc = null
let shuttingDown = false

function prefix(name, chunk) {
  const text = chunk.toString()
  for (const line of text.split('\n')) {
    if (line === '') continue
    process.stdout.write(`[${name}] ${line}\n`)
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

  if (houndProc && !houndProc.killed) {
    try { houndProc.kill(isWin ? 'SIGTERM' : 'SIGINT') } catch {}
  }
  if (nextProc && !nextProc.killed) {
    try { nextProc.kill(isWin ? 'SIGTERM' : 'SIGINT') } catch {}
  }

  // Give them a moment, then force kill if still alive
  setTimeout(() => {
    if (houndProc && !houndProc.killed) {
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

// Start both
console.log('══════════════════════════════════════════════════════════════════')
console.log('  LM Studio Chat — starting (with Hound MCP if available)')
console.log('══════════════════════════════════════════════════════════════════')
console.log('')

houndProc = startHound()
// Small delay so Hound logs come before Next.js logs
setTimeout(() => {
  nextProc = startNext()
}, 500)
