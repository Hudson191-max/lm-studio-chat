import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const { name, url, enabled } = await request.json()

    // Verify ownership
    const existing = await db.mcpServer.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    const server = await db.mcpServer.update({
      where: { id },
      data: { name, url, enabled },
    })

    return NextResponse.json({
      id: server.id,
      name: server.name,
      url: server.url,
      enabled: server.enabled,
      tools: JSON.parse(server.toolsJson || '[]'),
    })
  } catch {
    return NextResponse.json({ error: 'Failed to update MCP server' }, { status: 500 })
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const server = await db.mcpServer.findFirst({
      where: { id, userId: session!.user.id },
    })
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    // Refresh tools
    let tools: unknown[] = []
    try {
      const res = await fetch(server.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json()
        tools = data.result?.tools || []
      }
    } catch {
      return NextResponse.json({ error: 'Could not reach MCP server' }, { status: 502 })
    }

    const updated = await db.mcpServer.update({
      where: { id },
      data: { toolsJson: JSON.stringify(tools) },
    })

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      url: updated.url,
      enabled: updated.enabled,
      tools,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to refresh tools' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const existing = await db.mcpServer.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    await db.mcpServer.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete MCP server' }, { status: 500 })
  }
}
