import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { hashPassword } from '@/lib/auth'

// GET /api/admin/stats — Dashboard stats (admin only)
export async function GET() {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
        _count: {
          select: {
            conversations: true,
            loginAttempts: { where: { success: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

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
      users: usersWithStats.map((u) => ({
        ...u,
        messageCount: userMessageCounts[u.id] || 0,
      })),
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