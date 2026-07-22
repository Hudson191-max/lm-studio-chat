/**
 * Lightweight MCP client that supports both:
 *   - Legacy simple JSON-RPC over HTTP (single POST → JSON response)
 *   - New MCP "streamable HTTP" transport (2025-03-26 spec):
 *     initialize handshake → session ID → tools/list, with SSE-encoded responses
 *
 * Used by /api/mcp (add server) and /api/mcp/[id] (refresh tools).
 */

interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

interface McpDiscoveryResult {
  tools: McpTool[]
  protocol: 'streamable-http' | 'simple-json'
  serverInfo?: { name?: string; version?: string }
}

/** Parse an SSE-formatted text body and extract the first JSON `data:` payload. */
function parseSseBody(body: string): unknown | null {
  // SSE format: lines starting with "data: " contain JSON
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('data: ')) {
      const jsonStr = trimmed.slice(6)
      try {
        return JSON.parse(jsonStr)
      } catch {
        // try next line
      }
    }
  }
  // Maybe the whole body is just JSON (simple-json protocol)
  try {
    return JSON.parse(body)
  } catch {
    return null
  }
}

/**
 * Discover tools from an MCP server URL.
 * Tries the streamable HTTP protocol first (initialize + tools/list with session),
 * falls back to a single-shot tools/list POST for legacy servers.
 */
export async function discoverMcpTools(url: string, timeoutMs = 15000): Promise<McpDiscoveryResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    // Step 1: initialize handshake (streamable HTTP)
    const initRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'lm-studio-chat', version: '2.0.0' },
        },
      }),
      signal: controller.signal,
    })

    if (!initRes.ok) {
      // Maybe it's a legacy server that only accepts tools/list directly
      return await tryLegacyDiscovery(url, controller.signal, timeoutMs)
    }

    // Capture session ID from response header (streamable HTTP spec)
    const sessionId = initRes.headers.get('mcp-session-id') || ''
    const initBody = await initRes.text()
    const initParsed = parseSseBody(initBody) as
      | { result?: { serverInfo?: { name?: string; version?: string } } }
      | null

    // Step 2: send "initialized" notification (required by spec)
    if (sessionId) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream',
            'Mcp-Session-Id': sessionId,
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          }),
          signal: controller.signal,
        })
      } catch {
        // non-fatal
      }
    }

    // Step 3: call tools/list with session ID
    const toolsRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      }),
      signal: controller.signal,
    })

    if (!toolsRes.ok) {
      return { tools: [], protocol: 'streamable-http' }
    }

    const toolsBody = await toolsRes.text()
    const toolsParsed = parseSseBody(toolsBody) as
      | { result?: { tools?: McpTool[] }; error?: unknown }
      | null

    const tools = toolsParsed?.result?.tools || []

    return {
      tools,
      protocol: 'streamable-http',
      serverInfo: initParsed?.result?.serverInfo,
    }
  } catch {
    // Fall back to legacy single-shot discovery
    try {
      return await tryLegacyDiscovery(url, controller.signal, timeoutMs)
    } catch {
      return { tools: [], protocol: 'simple-json' }
    }
  } finally {
    clearTimeout(timeout)
  }
}

/** Legacy discovery: single POST tools/list, expect direct JSON. */
async function tryLegacyDiscovery(
  url: string,
  signal: AbortSignal,
  timeoutMs: number
): Promise<McpDiscoveryResult> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }),
    signal,
  })

  if (!res.ok) {
    return { tools: [], protocol: 'simple-json' }
  }

  const body = await res.text()
  const parsed = parseSseBody(body) as
    | { result?: { tools?: McpTool[] } }
    | null

  return {
    tools: parsed?.result?.tools || [],
    protocol: 'simple-json',
  }
}
