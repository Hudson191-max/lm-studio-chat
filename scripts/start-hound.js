#!/usr/bin/env node
/**
 * Hound MCP launcher.
 *
 * Spawns `hound --http --port 8765` as a child process so the chat app's
 * MCP dialog can connect to it at http://127.0.0.1:8765/mcp.
 *
 * Usage:
 *   node scripts/start-hound.js              # default port 8765
 *   HOUND_PORT=9000 node scripts/start-hound.js
 *
 * The process stays attached to your terminal so you see Hound's logs.
 * Press Ctrl+C to stop Hound (the launcher forwards the signal cleanly).
 *
 * If `hound` is not installed, prints install instructions and exits.
 */

const { spawn } = require('child_process')

const PORT = process.env.HOUND_PORT || '8765'
const HOST = process.env.HOUND_HOST || '127.0.0.1'

function main() {
  const child = spawn('hound', ['--http', '--host', HOST, '--port', PORT], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    env: { ...process.env },
  })

  let started = false

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    process.stdout.write(text)
    if (!started && text.includes('Uvicorn running on')) {
      started = true
      console.log('')
      console.log('══════════════════════════════════════════════════════════════════')
      console.log(`  Hound MCP is running at  http://${HOST}:${PORT}/mcp`)
      console.log('  Add this URL to the MCP dialog in the chat app to enable web search.')
      console.log('  Press Ctrl+C to stop.')
      console.log('══════════════════════════════════════════════════════════════════')
      console.log('')
    }
  })

  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk.toString())
  })

  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('')
      console.error('Hound is not installed.')
      console.error('')
      console.error('   Install it with:')
      console.error('     pip install hound-mcp[all]')
      console.error('     playwright install chromium')
      console.error('')
      console.error('   Or run the install helper:')
      console.error('     npm run install:hound')
      console.error('')
      console.error('   Then re-run: npm run start:hound')
      process.exit(1)
    }
    console.error('Failed to start Hound:', err.message)
    process.exit(1)
  })

  child.on('exit', (code) => {
    process.exit(code ?? 0)
  })

  // Forward Ctrl+C to the child
  process.on('SIGINT', () => {
    child.kill('SIGINT')
  })
  process.on('SIGTERM', () => {
    child.kill('SIGTERM')
  })
}

main()
