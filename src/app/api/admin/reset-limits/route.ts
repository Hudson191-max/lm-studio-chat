import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// POST /api/admin/reset-limits — Reset ALL users' rate limits to null (unlimited).
// Admin only. Nuclear option for when the admin panel is broken from bad data.
// Also runs the self-healing fix immediately.
export async function POST() {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await db.account.updateMany({
      where: {},
      data: {
        dailyMessageLimit: null,
        dailyTokenLimit: null,
      },
    })

    return NextResponse.json({
      success: true,
      message: `Reset rate limits for ${result.count} user(s). All limits are now unlimited.`,
      count: result.count,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to reset limits: ' + (err instanceof Error ? err.message : '') },
      { status: 500 }
    )
  }
}
