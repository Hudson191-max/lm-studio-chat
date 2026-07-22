import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireValidAuth } from '@/lib/auth-guard'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const settings = await db.settings.findMany({
      where: { userId: session!.user.id },
    })
    const settingsMap: Record<string, string> = {}
    for (const s of settings) {
      settingsMap[s.key] = s.value
    }
    return NextResponse.json(settingsMap)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireValidAuth()
  if (error) return error

  try {
    const body = await request.json()
    const { key, value } = body

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 })
    }

    // Use composite unique key [userId, key] for upsert
    await db.settings.upsert({
      where: { userId_key: { userId: session!.user.id, key } },
      update: { value: value ?? '' },
      create: { key, value: value ?? '', userId: session!.user.id },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
  }
}
