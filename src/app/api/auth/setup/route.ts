import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// Check if any accounts exist (for first-run detection)
// Also runs a one-time migration: if accounts exist but none have the admin
// role (e.g. created before the admin-panel update), promote the oldest
// account so existing installs gain an admin automatically.
export async function GET() {
  try {
    const count = await db.account.count()
    if (count > 0) {
      const adminCount = await db.account.count({ where: { role: 'admin' } })
      if (adminCount === 0) {
        const oldest = await db.account.findFirst({
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
        if (oldest) {
          await db.account.update({
            where: { id: oldest.id },
            data: { role: 'admin' },
          })
        }
      }
    }
    return NextResponse.json({ hasAccounts: count > 0 })
  } catch (error) {
    console.error('Setup GET error:', error)
    return NextResponse.json({ hasAccounts: false })
  }
}

// Create the first account (only works when no accounts exist)
export async function POST(request: NextRequest) {
  try {
    const existingCount = await db.account.count()
    if (existingCount > 0) {
      return NextResponse.json(
        { error: 'Account already exists. Please log in.' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { username, password } = body

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    if (username.length < 3) {
      return NextResponse.json(
        { error: 'Username must be at least 3 characters' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    let hashedPassword: string
    try {
      hashedPassword = await hashPassword(password)
    } catch (hashError) {
      console.error('Password hashing error:', hashError)
      return NextResponse.json(
        { error: 'Password hashing failed' },
        { status: 500 }
      )
    }

    // First account is always admin
    const account = await db.account.create({
      data: {
        username,
        password: hashedPassword,
        role: 'admin',
      },
    })

    return NextResponse.json({
      success: true,
      username: account.username,
      role: account.role,
    })
  } catch (error) {
    console.error('Setup POST error:', error)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}