#!/usr/bin/env node
/**
 * Cross-platform install helper for Hound MCP.
 * Runs scripts/install-hound.sh on Unix, scripts/install-hound.bat on Windows.
 */
const { spawn } = require('child_process')
const path = require('path')

const isWin = process.platform === 'win32'
const script = isWin ? 'install-hound.bat' : 'install-hound.sh'
const scriptPath = path.join(__dirname, script)

const child = isWin
  ? spawn('cmd', ['/c', scriptPath], { stdio: 'inherit' })
  : spawn('bash', [scriptPath], { stdio: 'inherit' })

child.on('exit', (code) => process.exit(code ?? 0))
