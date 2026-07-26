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
    const { content } = await request.json()

    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    const message = await db.message.findUnique({
      where: { id },
      include: { conversation: true },
    })

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Verify ownership via the conversation
    if (message.conversation.userId !== session!.user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (message.role !== 'user') {
      return NextResponse.json({ error: 'Only user messages can be edited' }, { status: 400 })
    }

    const updated = await db.message.update({
      where: { id },
      data: { content, editedAt: new Date() },
    })

    await db.message.deleteMany({
      where: {
        conversationId: message.conversationId,
        createdAt: { gt: message.createdAt },
      },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
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
    const message = await db.message.findUnique({
      where: { id },
      include: { conversation: { select: { userId: true } } },
    })
    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    if (message.conversation.userId !== session!.user.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    await db.message.deleteMany({
      where: {
        conversationId: message.conversationId,
        createdAt: { gte: message.createdAt },
      },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 })
  }
}
