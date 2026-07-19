import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const { error } = await requireAuth()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const conversations = await db.conversation.findMany({
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
  const { error } = await requireAuth()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const body = await request.json()
    const { title, systemPrompt, profileId } = body

    const conversation = await db.conversation.create({
      data: {
        title: title || 'New Chat',
        systemPrompt: systemPrompt || '',
        profileId: profileId || null,
      },
    })

    return NextResponse.json(conversation)
  } catch {
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}