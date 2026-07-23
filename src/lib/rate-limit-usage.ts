import { db } from '@/lib/db'

export interface UsageCheckResult {
  allowed: boolean
  reason?: string
  current: {
    messages: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  limits: {
    dailyMessageLimit: number | null
    dailyTokenLimit: number | null
  }
}

/** Returns midnight UTC for a given date as a Date object. */
function midnightUTC(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Check whether a user is allowed to send a message based on their daily
 * rate limits. Returns the current usage + limits so callers can show
 * meaningful feedback.
 *
 * Limits are stored on the Account row:
 *   dailyMessageLimit (null = unlimited)
 *   dailyTokenLimit   (null = unlimited)
 *
 * Usage is tracked in UsageRecord (one row per user per UTC day).
 */
export async function checkRateLimit(userId: string): Promise<UsageCheckResult> {
  const account = await db.account.findUnique({
    where: { id: userId },
    select: { dailyMessageLimit: true, dailyTokenLimit: true },
  })

  if (!account) {
    return {
      allowed: false,
      reason: 'Account not found',
      current: { messages: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      limits: { dailyMessageLimit: null, dailyTokenLimit: null },
    }
  }

  const today = midnightUTC()
  const usage = await db.usageRecord.findUnique({
    where: { userId_date: { userId, date: today } },
  })

  const current = {
    messages: usage?.messages ?? 0,
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  }

  // Admins are always exempt (they manage the system)
  const fullAccount = await db.account.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  if (fullAccount?.role === 'admin') {
    return {
      allowed: true,
      current,
      limits: { dailyMessageLimit: account.dailyMessageLimit, dailyTokenLimit: account.dailyTokenLimit },
    }
  }

  const msgLimit = account.dailyMessageLimit
  const tokLimit = account.dailyTokenLimit

  if (msgLimit !== null && current.messages >= msgLimit) {
    return {
      allowed: false,
      reason: `Daily message limit reached (${current.messages}/${msgLimit}). Resets at midnight UTC.`,
      current,
      limits: { dailyMessageLimit: msgLimit, dailyTokenLimit: tokLimit },
    }
  }

  if (tokLimit !== null && current.totalTokens >= tokLimit) {
    return {
      allowed: false,
      reason: `Daily token limit reached (${current.totalTokens}/${tokLimit}). Resets at midnight UTC.`,
      current,
      limits: { dailyMessageLimit: msgLimit, dailyTokenLimit: tokLimit },
    }
  }

  return {
    allowed: true,
    current,
    limits: { dailyMessageLimit: msgLimit, dailyTokenLimit: tokLimit },
  }
}

/**
 * Increment a user's usage for today by the given amounts.
 * Creates the UsageRecord row if it doesn't exist yet (upsert).
 */
export async function recordUsage(
  userId: string,
  usage: { messages?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number }
): Promise<void> {
  const today = midnightUTC()
  await db.usageRecord.upsert({
    where: { userId_date: { userId, date: today } },
    create: {
      userId,
      date: today,
      messages: usage.messages ?? 0,
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
    },
    update: {
      messages: { increment: usage.messages ?? 0 },
      promptTokens: { increment: usage.promptTokens ?? 0 },
      completionTokens: { increment: usage.completionTokens ?? 0 },
      totalTokens: { increment: usage.totalTokens ?? 0 },
    },
  })
}
