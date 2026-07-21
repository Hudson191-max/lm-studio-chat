import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const q = request.nextUrl.searchParams.get('q') || ''
    if (!q.trim()) {
      return NextResponse.json({ results: [] })
    }

    // SQLite LIKE search (case-insensitive)
    const conversations = await db.conversation.findMany({
      where: {
        userId: session!.user.id,
        messages: {
          some: {
            content: { contains: q },
          },
        },
      },
      include: {
        messages: {
          where: { content: { contains: q } },
          orderBy: { createdAt: 'asc' },
          take: 3,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    })

    const results = conversations.map((c) => ({
      id: c.id,
      title: c.title,
      matchingMessages: c.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        // Highlight match context
        snippet: getSnippet(m.content, q),
      })),
    }))

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

function getSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 100) + '...'
  
  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + query.length + 40)
  let snippet = ''
  if (start > 0) snippet += '...'
  snippet += content.slice(start, end)
  if (end < content.length) snippet += '...'
  return snippet
}