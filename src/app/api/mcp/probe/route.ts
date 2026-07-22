import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { discoverMcpTools } from '@/lib/mcp-client'

// GET /api/mcp/probe?url=... — probe an MCP server without saving it.
// Used by the MCP dialog to show a live "running / not running" badge for
// the Hound preset (and any other server the user is considering adding).
export async function GET(request: Request) {
  const { error } = await requireAuth()
  if (error) return error

  const url = new URL(request.url).searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url query param is required' }, { status: 400 })
  }

  try {
    const result = await discoverMcpTools(url, 8000)
    return NextResponse.json({
      reachable: true,
      tools: result.tools,
      toolCount: result.tools.length,
      protocol: result.protocol,
      serverInfo: result.serverInfo,
    })
  } catch (err) {
    return NextResponse.json({
      reachable: false,
      tools: [],
      toolCount: 0,
      error: err instanceof Error ? err.message : 'Could not reach server',
    })
  }
}
