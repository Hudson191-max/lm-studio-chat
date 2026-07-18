import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

export async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: 'Unauthorized', session: null }
  }
  return { error: null, session }
}