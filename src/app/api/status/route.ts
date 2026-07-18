import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  try {
    let lmStudioUrl = 'http://localhost:1234/v1'
    try {
      const urlSetting = await db.settings.findUnique({ where: { key: 'lmStudioUrl' } })
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
    const models = (data.data || []).map((m: { id: string }) => m.id)

    return NextResponse.json({
      connected: true,
      models,
    })
  } catch (error) {
    return NextResponse.json({
      connected: false,
      error: 'Failed to check LM Studio status',
      models: [],
    })
  }
}