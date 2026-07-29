import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { hashPassword } from '@/lib/auth'

const MSG_LIMIT_MAX = 1000000
const TOK_LIMIT_MAX = 10000000000

/**
 * Sanitize a limit value. Returns null for anything invalid:
 * - null/undefined → null (unlimited, valid)
 * - NaN / Infinity / non-integer → null
 * - negative → null
 * - exceeds max → null (auto-fix will clean this up in the DB)
 */
function sanitizeLimit(v: unknown, max: number): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null
  if (n > max) return null
  return n
}

/**
 * Self-healing: scan all accounts for invalid limit values and auto-fix them.
 * Called at the start of every admin stats fetch. If any account has a bad
 * value (NaN, Infinity, exceeds max, etc.), it's reset to null in the DB
 * so the admin panel never crashes from stale corrupt data.
 */
async function autoFixBadLimits() {
  try {
    const accounts = await db.account.findMany({
      select: { id: true, dailyMessageLimit: true, dailyTokenLimit: true },
    })
    const fixes: Promise<unknown>[] = []
    for (const a of accounts) {
      const badMsg = a.dailyMessageLimit !== null && sanitizeLimit(a.dailyMessageLimit, MSG_LIMIT_MAX) === null
      const badTok = a.dailyTokenLimit !== null && sanitizeLimit(a.dailyTokenLimit, TOK_LIMIT_MAX) === null
      if (badMsg || badTok) {
        console.warn(`[admin] Auto-fixing bad limit values for account ${a.id}: msg=${a.dailyMessageLimit} tok=${a.dailyTokenLimit}`)
        fixes.push(
          db.account.update({
            where: { id: a.id },
            data: {
              ...(badMsg ? { dailyMessageLimit: null } : {}),
              ...(badTok ? { dailyTokenLimit: null } : {}),
            },
          })
        )
      }
    }
    if (fixes.length > 0) {
      await Promise.all(fixes)
      console.log(`[admin] Auto-fixed ${fixes.length} account(s) with bad limit values`)
    }
  } catch {
    // non-fatal — don't let the self-healing crash the stats endpoint
  }
}

// GET /api/admin/stats — Dashboard stats (admin only)
export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Self-heal: fix any bad limit values before returning stats
  await autoFixBadLimits()

  try {
    const totalUsers = await db.account.count()
    const totalConversations = await db.conversation.count()
    const totalMessages = await db.message.count()
    const totalLogins = await db.loginAttempt.count({ where: { success: true } })

    // Messages today
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const messagesToday = await db.message.count({
      where: { createdAt: { gte: today } },
    })

    // Active users today (users who sent a message today)
    const recentMessages = await db.message.findMany({
      where: { createdAt: { gte: today } },
      include: { conversation: { select: { userId: true } } },
      distinct: ['conversationId'],
    })
    const activeToday = new Set(recentMessages.map((m) => m.conversation.userId)).size

    // Conversations per user
    const usersWithStats = await db.account.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
        dailyMessageLimit: true,
        dailyTokenLimit: true,
        _count: {
          select: {
            conversations: true,
            loginAttempts: { where: { success: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Today's usage per user (for rate limit display)
    const usageToday = new Date()
    usageToday.setUTCHours(0, 0, 0, 0)
    const todayUsage = await db.usageRecord.findMany({
      where: { date: usageToday },
      select: {
        userId: true,
        messages: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
      },
    })
    const usageByUserId = new Map(todayUsage.map((u) => [u.userId, u]))

    // Recent login attempts (last 50)
    const recentLogins = await db.loginAttempt.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Count messages per user through conversations
    const userMessageCounts: Record<string, number> = {}
    for (const userId of usersWithStats.map((u) => u.id)) {
      const convos = await db.conversation.findMany({
        where: { userId },
        select: { id: true },
      })
      const convoIds = convos.map((c) => c.id)
      if (convoIds.length > 0) {
        const count = await db.message.count({
          where: { conversationId: { in: convoIds } },
        })
        userMessageCounts[userId] = count
      } else {
        userMessageCounts[userId] = 0
      }
    }

    return NextResponse.json({
      totalUsers,
      totalConversations,
      totalMessages,
      totalLogins,
      messagesToday,
      activeToday,
      users: usersWithStats.map((u) => {
        const usage = usageByUserId.get(u.id)
        // Sanitize limit values — prevent NaN/Infinity/huge numbers from
        // crashing the admin panel. If a value is invalid, treat as null.
        const safeMsgLimit = sanitizeLimit(u.dailyMessageLimit, 1000000)
        const safeTokLimit = sanitizeLimit(u.dailyTokenLimit, 10000000000)
        return {
          ...u,
          dailyMessageLimit: safeMsgLimit,
          dailyTokenLimit: safeTokLimit,
          messageCount: userMessageCounts[u.id] || 0,
          todayUsage: usage
            ? {
                messages: usage.messages || 0,
                promptTokens: usage.promptTokens || 0,
                completionTokens: usage.completionTokens || 0,
                totalTokens: usage.totalTokens || 0,
              }
            : { messages: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        }
      }),
      recentLogins,
    })
  } catch (err) {
    console.error('Admin stats error:', err)
    return NextResponse.json({ error: 'Failed to load admin stats' }, { status: 500 })
  }
}

// POST /api/admin/users — Create a new user (admin only)
export async function POST(request: Request) {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json() as { username: string; password: string; role?: string }
    const { username, password, role } = body

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 })
    }
    if (username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const hashedPassword = await hashPassword(password)
    const account = await db.account.create({
      data: {
        username,
        password: hashedPassword,
        role: role || 'user',
      },
    })

    return NextResponse.json({
      success: true,
      id: account.id,
      username: account.username,
      role: account.role,
    })
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}