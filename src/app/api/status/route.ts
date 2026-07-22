import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

interface ModelInfo {
  id: string
  contextLength?: number
}

export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    let lmStudioUrl = 'http://localhost:1234/v1'
    try {
      // Per-user settings: use composite unique key
      const urlSetting = await db.settings.findUnique({
        where: { userId_key: { userId: session!.user.id, key: 'lmStudioUrl' } },
      })
      if (urlSetting?.value) {
        lmStudioUrl = urlSetting.value.replace(/\/+$/, '')
      }
    } catch {
      // Use default
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let response: Response
    try {
      response = await fetch(`${lmStudioUrl}/models`, {
        method: 'GET',
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch {
      clearTimeout(timeout)
      return NextResponse.json({
        connected: false,
        error: `Cannot connect to ${lmStudioUrl}`,
        models: [],
      })
    }

    if (!response.ok) {
      return NextResponse.json({
        connected: false,
        error: `LM Studio returned ${response.status}`,
        models: [],
      })
    }

    const data = await response.json()
    const models: ModelInfo[] = (data.data || []).map((m: Record<string, unknown>) => ({
      id: (m.id as string) || 'unknown',
      contextLength: (m.context_length as number) || undefined,
    }))

    return NextResponse.json({
      connected: true,
      models,
    })
  } catch {
    return NextResponse.json({
      connected: false,
      error: 'Failed to check LM Studio status',
      models: [],
    })
  }
}
