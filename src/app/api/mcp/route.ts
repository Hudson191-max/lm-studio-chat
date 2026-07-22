import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
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
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { name, url } = await request.json()

    if (!name || !url) {
      return NextResponse.json({ error: 'Name and URL are required' }, { status: 400 })
    }

    // Discover tools from the MCP server (supports both streamable HTTP and legacy)
    let tools: unknown[] = []
    try {
      const result = await discoverMcpTools(url)
      tools = result.tools
    } catch {
      // Server might not be reachable yet, that's ok — save with empty tools
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
    })
  } catch {
    return NextResponse.json({ error: 'Failed to add MCP server' }, { status: 500 })
  }
}