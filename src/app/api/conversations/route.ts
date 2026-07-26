import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireValidAuth } from '@/lib/auth-guard'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const conversations = await db.conversation.findMany({
      where: { userId: session!.user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 1 },
        profile: { select: { id: true, name: true } },
      },
    })
    return NextResponse.json(conversations)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireValidAuth()
  if (error) return error

  try {
    const body = await request.json()
    const { title, systemPrompt, profileId } = body

    // If profileId is provided, verify it belongs to the user
    if (profileId) {
      const profile = await db.modelProfile.findFirst({
        where: { id: profileId, userId: session!.user.id },
        select: { id: true },
      })
      if (!profile) {
        return NextResponse.json({ error: 'Invalid profile' }, { status: 400 })
      }
    }

    const conversation = await db.conversation.create({
      data: {
        title: title || 'New Chat',
        systemPrompt: systemPrompt || '',
        profileId: profileId || null,
        userId: session!.user.id,
      },
    })

    return NextResponse.json(conversation)
  } catch {
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
