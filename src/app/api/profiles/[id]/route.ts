import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const data = await request.json()

    // Verify ownership
    const existing = await db.modelProfile.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (data.isDefault) {
      await db.modelProfile.updateMany({
        where: { userId: session!.user.id },
        data: { isDefault: false },
      })
    }

    const profile = await db.modelProfile.update({
      where: { id },
      data: {
        name: data.name,
        url: data.url,
        model: data.model,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        isDefault: data.isDefault,
      },
    })

    return NextResponse.json(profile)
  } catch {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const { id } = await params
    const existing = await db.modelProfile.findFirst({
      where: { id, userId: session!.user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    await db.modelProfile.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 })
  }
}
