import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { getCatalogEntry } from '@/lib/mcp-catalog'

// POST /api/marketplace/[catalogId] — enable a marketplace entry.
// Admin only. Body: { config?: Record<string, string> } (required for entries
// with configRequired=true, e.g. Google Calendar OAuth credentials).
// The entry is saved to the DB; the orchestrator reads it on next startup
// and spawns the bridge. Returns "restart required" since we don't live-spawn.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ catalogId: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { catalogId } = await params
  const entry = getCatalogEntry(catalogId)
  if (!entry) {
    return NextResponse.json({ error: 'Unknown catalog entry' }, { status: 404 })
  }

  let config: Record<string, string> = {}
  try {
    const body = await request.json()
    config = body.config || {}
  } catch {
    // empty body is fine for zero-config entries
  }

  // Validate required config fields
  if (entry.configRequired && entry.configFields) {
    for (const field of entry.configFields) {
      if (field.required && !config[field.key]) {
        return NextResponse.json(
          { error: `Missing required field: ${field.label}` },
          { status: 400 }
        )
      }
    }
  }

  try {
    const saved = await db.marketplaceEntry.upsert({
      where: { catalogId },
      create: {
        catalogId,
        name: entry.name,
        enabled: true,
        config: JSON.stringify(config),
      },
      update: {
        enabled: true,
        config: JSON.stringify(config),
      },
    })

    return NextResponse.json({
      success: true,
      entry: saved,
      restartRequired: true,
      message: `${entry.name} enabled. Restart the app (STOP.bat + START.bat, or npm run stop:all && npm run start:all) to activate it.`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to enable entry: ' + (err instanceof Error ? err.message : '') },
      { status: 500 }
    )
  }
}

// DELETE /api/marketplace/[catalogId] — disable a marketplace entry.
// Admin only. The orchestrator will stop spawning the bridge on next restart.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ catalogId: string }> }
) {
  const { error, session } = await requireAuth()
  if (error) return error
  if (session?.user?.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { catalogId } = await params

  try {
    await db.marketplaceEntry.deleteMany({ where: { catalogId } })
    return NextResponse.json({
      success: true,
      restartRequired: true,
      message: 'Entry disabled. Restart the app to stop the server.',
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to disable entry: ' + (err instanceof Error ? err.message : '') },
      { status: 500 }
    )
  }
}
