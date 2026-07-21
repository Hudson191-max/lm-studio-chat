import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { Session, User } from 'next-auth'
import { checkRateLimit, recordAttempt } from '@/lib/rate-limit'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        const ip = req?.headers?.['x-forwarded-for'] as string || req?.headers?.['x-real-ip'] as string || 'unknown'

        // Rate limit check
        const rateCheck = checkRateLimit(ip, credentials.username)
        if (!rateCheck.allowed) {
          throw new Error(`Too many login attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 60000)} minutes.`)
        }

        const account = await db.account.findUnique({
          where: { username: credentials.username },
        })

        if (!account) {
          recordAttempt(ip, credentials.username, false)
          return null
        }

        const isValid = await verifyPassword(credentials.password, account.password)
        if (!isValid) {
          recordAttempt(ip, credentials.username, false)
          return null
        }

        // Record successful login
        recordAttempt(ip, credentials.username, true)
        await db.loginAttempt.create({
          data: { ip, username: credentials.username, success: true, accountId: account.id }
        })

        return {
          id: account.id,
          name: account.username,
          role: account.role,
        } as User
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.username = user.name
        token.role = (user as User & { role?: string }).role || 'user'
      }
      return token
    },
    async session({ session, token }) {
      const customSession = session as Session & { user: { id: string; username: string; role: string } }
      if (token && customSession.user) {
        customSession.user.id = token.id as string
        customSession.user.username = token.username as string
        customSession.user.role = (token.role as string) || 'user'
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'lm-studio-chat-secret-change-me-in-production',
}