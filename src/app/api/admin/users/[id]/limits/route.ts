import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// PATCH /api/admin/users/[id]/limits
// Set per-user daily rate limits. Admin only.
// Body: { dailyMessageLimit?: number | null, dailyTokenLimit?: number | null }
// Pass null to remove a limit (unlimited).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { dailyMessageLimit, dailyTokenLimit } = body as {
    dailyMessageLimit?: number | null
    dailyTokenLimit?: number | null
  }

  // Validate: must be null or a positive integer
  const validate = (v: unknown, name: string): number | null | undefined => {
    if (v === null || v === undefined) return v as null | undefined
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
      throw new Error(`${name} must be null or a non-negative integer`)
    }
    return n
  }

  try {
    const msgLimit = validate(dailyMessageLimit, 'dailyMessageLimit')
    const tokLimit = validate(dailyTokenLimit, 'dailyTokenLimit')

    const data: { dailyMessageLimit?: number | null; dailyTokenLimit?: number | null } = {}
    if (msgLimit !== undefined) data.dailyMessageLimit = msgLimit
    if (tokLimit !== undefined) data.dailyTokenLimit = tokLimit

    const updated = await db.account.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        dailyMessageLimit: true,
        dailyTokenLimit: true,
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update limits' },
      { status: 400 }
    )
  }
}
