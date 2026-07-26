import { db } from '@/lib/db'
import { requireAuth, requireValidAuth } from '@/lib/auth-guard'
import { discoverMcpTools } from '@/lib/mcp-client'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const servers = await db.mcpServer.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: 'desc' },
    })

    const results = servers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      enabled: s.enabled,
      tools: JSON.parse(s.toolsJson || '[]'),
    }))

    return NextResponse.json(results)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch MCP servers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // requireValidAuth verifies the session user ID still exists in the DB,
  // catching the case where the DB was reset but the browser has an old JWT.
  const { error, session } = await requireValidAuth()
  if (error) return error

  try {
    const { name, url } = await request.json()

    if (!name || !url) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 })
    }

    // Discover tools from the MCP server (supports both streamable HTTP and legacy)
    let tools: unknown[] = []
    let discoveryError: string | null = null
    try {
      const result = await discoverMcpTools(url)
      tools = result.tools
      if (tools.length === 0) {
        discoveryError = 'Server was reachable but returned 0 tools. It may still be starting up — try refreshing in a few seconds.'
      }
    } catch (err) {
      discoveryError = err instanceof Error ? err.message : 'Could not reach the server'
    }

    // If we couldn't reach the server at all, return a clear error instead of
    // silently saving an empty-tools entry. The user can retry once it's running.
    if (tools.length === 0 && discoveryError && !discoveryError.includes('0 tools')) {
      return NextResponse.json(
        { error: `Could not connect to ${url}. ${discoveryError}. Make sure the MCP server is running.` },
        { status: 502 }
      )
    }

    const server = await db.mcpServer.create({
      data: {
        name,
        url,
        toolsJson: JSON.stringify(tools),
        userId: session!.user.id,
      },
    })

    return NextResponse.json({
      id: server.id,
      name: server.name,
      url: server.url,
      enabled: server.enabled,
      tools,
      warning: discoveryError || undefined,
    })
  } catch (err) {
    // Surface the real error so the user can diagnose (was previously swallowed)
    const detail = err instanceof Error ? err.message : String(err)
    let hint = ''
    if (detail.includes('does not exist') || detail.includes('relation') || detail.includes('column')) {
      hint = ' Database schema may be out of date. Run: npx prisma db push'
    } else if (detail.includes('Unique constraint') || detail.includes('P2002')) {
      hint = ' An MCP server with this URL already exists.'
    }
    console.error('MCP POST error:', detail)
    return NextResponse.json(
      { error: `Failed to add MCP server: ${detail}${hint}` },
      { status: 500 }
    )
  }
}