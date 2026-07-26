import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/conversations/[id]/branch
// Creates a new conversation that is a copy of the source conversation's
// messages up to (and including) the message with `fromMessageId`.
// The new conversation gets the title "{original title} (branch)".
//
// Body: { fromMessageId: string }
// Returns: the new conversation object (with messages)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const body = await request.json()
    const { fromMessageId } = body as { fromMessageId?: string }

    if (!fromMessageId) {
      return NextResponse.json({ error: 'fromMessageId is required' }, { status: 400 })
    }

    // Verify the source conversation belongs to the user
    const sourceConvo = await db.conversation.findFirst({
      where: { id, userId: session!.user.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!sourceConvo) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Find the fork point
    const forkIndex = sourceConvo.messages.findIndex((m) => m.id === fromMessageId)
    if (forkIndex === -1) {
      return NextResponse.json({ error: 'Message not found in this conversation' }, { status: 404 })
    }

    // Messages to copy (everything up to and including the fork point)
    const messagesToCopy = sourceConvo.messages.slice(0, forkIndex + 1)

    if (messagesToCopy.length === 0) {
      return NextResponse.json({ error: 'Nothing to branch from' }, { status: 400 })
    }

    // Create the new conversation
    const branchTitle = `${sourceConvo.title} (branch)`.slice(0, 100)
    const newConvo = await db.conversation.create({
      data: {
        title: branchTitle,
        systemPrompt: sourceConvo.systemPrompt,
        profileId: sourceConvo.profileId,
        userId: session!.user.id,
        messages: {
          create: messagesToCopy.map((m) => ({
            role: m.role,
            content: m.content,
            thinking: m.thinking,
            images: m.images,
            toolCalls: m.toolCalls,
          })),
        },
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

    return NextResponse.json({
      id: newConvo.id,
      title: newConvo.title,
      systemPrompt: newConvo.systemPrompt,
      profileId: newConvo.profileId,
      createdAt: newConvo.createdAt,
      updatedAt: newConvo.updatedAt,
      messages: newConvo.messages,
      branchedFrom: id,
      branchedFromMessageId: fromMessageId,
    })
  } catch (err) {
    console.error('Branch error:', err)
    return NextResponse.json(
      { error: 'Failed to create branch: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    )
  }
}
