import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// DELETE /api/admin/users/[id] — Delete a user (admin only, cannot delete yourself)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
  }

  try {
    // Clean up all user-owned data (cascade handles this for new rows, but
    // we delete explicitly for safety on legacy data without the cascade).
    await db.settings.deleteMany({ where: { userId: id } })
    await db.mcpServer.deleteMany({ where: { userId: id } })
    await db.modelProfile.deleteMany({ where: { userId: id } })
    await db.conversation.deleteMany({ where: { userId: id } })
    await db.loginAttempt.deleteMany({ where: { accountId: id } })
    await db.account.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Delete user error:', err)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}