import { execSync } from 'child_process'
import { CatalogEntry } from './mcp-catalog'

export type BridgeType = 'supergateway' | 'mcp-proxy' | 'native-http' | 'none'

export interface BridgeDetection {
  type: BridgeType
  /** Full spawn command (for logging). */
  command: string
  /** Whether the bridge is available on this system. */
  available: boolean
  /** Reason if not available (for UI display). */
  reason?: string
}

/**
 * Detect which bridge to use for a given catalog entry.
 *
 * Priority:
 *   1. "native-http" — the server has built-in --http mode (e.g. Hound).
 *      No bridge needed; we spawn the server directly.
 *   2. "supergateway" — Node bridge, preferred for Node servers.
 *   3. "mcp-proxy" — Python bridge, fallback.
 *   4. "none" — neither bridge installed.
 */
export function detectBridge(entry: CatalogEntry): BridgeDetection {
  // Hound has native --http mode (the command contains "--http")
  if (entry.command.includes('--http')) {
    return {
      type: 'native-http',
      command: entry.command,
      available: true,
    }
  }

  // Try supergateway first (Node bridge — works for both Node and Python servers)
  if (hasCommand('npx')) {
    try {
      execSync('npx -y supergateway --help', { stdio: 'ignore', timeout: 15000 })
      // supergateway exists — but we need to also verify the underlying command's runtime is available
      const runtimeOk =
        entry.runtime === 'node' ? hasCommand('npx') :
        entry.runtime === 'python' ? hasCommand('python') || hasCommand('python3') :
        true
      if (runtimeOk) {
        return {
          type: 'supergateway',
          command: `npx -y supergateway --stdio "${entry.command}" --port {PORT}`,
          available: true,
        }
      }
    } catch {
      // supergateway not available, fall through to mcp-proxy
    }
  }

  // Fallback: mcp-proxy (Python)
  if (hasCommand('mcp-proxy') || hasCommand('python') || hasCommand('python3')) {
    try {
      // Check if mcp-proxy is installed
      execSync('mcp-proxy --help', { stdio: 'ignore', timeout: 5000 })
      return {
        type: 'mcp-proxy',
        command: `mcp-proxy --port {PORT} -- ${entry.command}`,
        available: true,
      }
    } catch {
      // mcp-proxy not installed but Python is — could install it
    }
  }

  return {
    type: 'none',
    command: '',
    available: false,
    reason: 'Neither supergateway (Node) nor mcp-proxy (Python) is installed. Run: npm i -g supergateway  OR  pip install mcp-proxy',
  }
}

/** Build the actual spawn command with port + config substituted. */
export function buildSpawnCommand(
  entry: CatalogEntry,
  port: number,
  config: Record<string, string> = {}
): { cmd: string; args: string[]; env: Record<string, string>; shell: boolean } {
  const detection = detectBridge(entry)
  const portStr = String(port)

  // Native HTTP (Hound): spawn directly
  if (detection.type === 'native-http') {
    const cmd = entry.command.replace('{PORT}', portStr)
    return { cmd, args: [], env: {}, shell: true }
  }

  // Build env vars from config (for entries that need them, e.g. Google Calendar)
  const env: Record<string, string> = {}
  if (entry.envMapping) {
    for (const [configKey, envVar] of Object.entries(entry.envMapping)) {
      if (config[configKey]) {
        env[envVar] = config[configKey]
      }
    }
  }

  // supergateway: npx -y supergateway --stdio "<cmd>" --port <port>
  if (detection.type === 'supergateway') {
    return {
      cmd: 'npx',
      args: ['-y', 'supergateway', '--stdio', entry.command, '--port', portStr],
      env,
      shell: false,
    }
  }

  // mcp-proxy: mcp-proxy --port <port> -- <cmd>
  if (detection.type === 'mcp-proxy') {
    // mcp-proxy needs the command as separate args after --
    const cmdParts = entry.command.split(' ')
    return {
      cmd: 'mcp-proxy',
      args: ['--port', portStr, '--', ...cmdParts],
      env,
      shell: false,
    }
  }

  // No bridge available — return empty (caller should check detection.available first)
  return { cmd: '', args: [], env: {}, shell: false }
}

/** Check if a command exists on PATH. */
function hasCommand(cmd: string): boolean {
  try {
    execSync(`${process.platform === 'win32' ? 'where' : 'which'} ${cmd}`, { stdio: 'ignore', timeout: 3000 })
    return true
  } catch {
    return false
  }
}
