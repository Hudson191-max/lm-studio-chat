import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const conversation = await db.conversation.findFirst({
      where: { id, userId: session!.user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    return NextResponse.json(conversation)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const existing = await db.conversation.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const body = await request.json()
    const { title, systemPrompt } = body
    const data: Record<string, string> = {}
    if (title !== undefined) data.title = title
    if (systemPrompt !== undefined) data.systemPrompt = systemPrompt

    const conversation = await db.conversation.update({ where: { id }, data })
    return NextResponse.json(conversation)
  } catch {
    return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
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
    const existing = await db.conversation.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    await db.conversation.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
