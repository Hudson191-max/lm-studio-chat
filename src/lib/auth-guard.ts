import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth-options'
import { db } from '@/lib/db'

export async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null }
  }
  return { error: null, session }
}

/**
 * Like requireAuth, but also verifies the session's user ID still exists
 * in the database. Use this on routes that write user-owned data
 * (conversations, settings, mcp, profiles) to catch the case where the
 * DB was reset but the browser still has an old JWT — without this, the
 * INSERT would fail with a confusing foreign key constraint violation.
 *
 * Returns { error, session } where error is a NextResponse (already
 * formatted with a clear "sign out and back in" message) if the account
 * is missing.
 */
export async function requireValidAuth() {
  const authResult = await requireAuth()
  if (authResult.error) return authResult

  const session = authResult.session!
  try {
    const account = await db.account.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    })
    if (!account) {
      return {
        error: NextResponse.json(
          { error: 'Your session is invalid (account not found). Please sign out and sign back in.' },
          { status: 401 }
        ),
        session: null,
      }
    }
  } catch {
    // If the DB query itself fails (e.g. schema out of date), let the
    // route handler surface that error — don't mask it here.
  }

  return { error: null, session }
}
