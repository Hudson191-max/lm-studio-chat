import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { checkRateLimit } from '@/lib/rate-limit-usage'
import { db } from '@/lib/db'

// GET /api/usage — returns the current user's daily usage + limits.
// Used by the chat footer to show remaining quota.
//
// Response shape:
//   {
//     exempt: boolean,         // true for admins (always allowed)
//     limits: { dailyMessageLimit: number|null, dailyTokenLimit: number|null },
//     current: { messages, promptTokens, completionTokens, totalTokens }
//   }
//
// The frontend shows the quota indicator only when:
//   - not exempt AND
//   - at least one limit is set (non-null)
export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const [result, account] = await Promise.all([
      checkRateLimit(session!.user.id),
      db.account.findUnique({
        where: { id: session!.user.id },
        select: { role: true },
      }),
    ])

    const isAdmin = account?.role === 'admin'
    const hasLimits = result.limits.dailyMessageLimit !== null || result.limits.dailyTokenLimit !== null

    return NextResponse.json({
      exempt: isAdmin,
      hasLimits,
      limits: result.limits,
      current: result.current,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch usage: ' + (err instanceof Error ? err.message : '') },
      { status: 500 }
    )
  }
}
