import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const { id } = await params
    const conversation = await db.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    })

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    let md = `# ${conversation.title}\n\n`
    md += `*Exported: ${new Date().toISOString()}*\n\n---\n\n`

    for (const msg of conversation.messages) {
      const label = msg.role === 'user' ? '**You**' : `**${msg.role === 'assistant' ? 'AI' : msg.role}**`
      const time = new Date(msg.createdAt).toLocaleString()
      md += `### ${label} (${time})\n\n${msg.content}\n\n---\n\n`
    }

    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${conversation.title.replace(/[^a-z0-9]/gi, '_')}.md"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}