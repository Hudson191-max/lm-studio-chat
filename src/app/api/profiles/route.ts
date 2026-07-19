import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const profiles = await db.modelProfile.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(profiles)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return NextResponse.json({ error }, { status: 401 })

  try {
    const { name, url, model, temperature, maxTokens, isDefault } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // If setting as default, unset others
    if (isDefault) {
      await db.modelProfile.updateMany({
        where: { userId: session!.user.id },
        data: { isDefault: false },
      })
    }

    const profile = await db.modelProfile.create({
      data: {
        name,
        url: url || 'http://localhost:1234/v1',
        model: model || '',
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 2048,
        isDefault: isDefault || false,
        userId: session!.user.id,
      },
    })

    return NextResponse.json(profile)
  } catch {
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 })
  }
}