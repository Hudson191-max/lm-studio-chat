import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'

export async function requireAuth() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return { error: 'Unauthorized', session: null }
  }
  return { error: null, session }
}
