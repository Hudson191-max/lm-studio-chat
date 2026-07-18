import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const settings = await db.settings.findMany()
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
  const { error } = await requireAuth()
  if (error) return error

  try {
    const body = await request.json()
    const { key, value } = body

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 })
    }

    await db.settings.upsert({
      where: { key },
      update: { value: value ?? '' },
      create: { key, value: value ?? '' },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
  }
}