import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { discoverMcpTools } from '@/lib/mcp-client'
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

    // Refresh tools using the shared MCP client (handles streamable HTTP + legacy)
    let tools: unknown[] = []
    try {
      const result = await discoverMcpTools(server.url)
      tools = result.tools
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
