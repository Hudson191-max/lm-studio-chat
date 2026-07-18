import { db } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import NextAuth, { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import type { Session, User } from 'next-auth'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        const account = await db.account.findUnique({
          where: { username: credentials.username },
        })

        if (!account) return null

        const isValid = await verifyPassword(credentials.password, account.password)
        if (!isValid) return null

        return {
          id: account.id,
          name: account.username,
        } as User
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.username = user.name
      }
      return token
    },
    async session({ session, token }) {
      const customSession = session as Session & { user: { id: string; username: string } }
      if (token && customSession.user) {
        customSession.user.id = token.id as string
        customSession.user.username = token.username as string
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'lm-studio-chat-secret-change-me-in-production',
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }