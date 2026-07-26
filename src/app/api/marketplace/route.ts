import { db } from '@/lib/db'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { MCP_CATALOG } from '@/lib/mcp-catalog'

// GET /api/marketplace — list all catalog entries + their enabled status.
// Available to any authenticated user (the marketplace UI is visible to all,
// but only admins can enable/disable — see POST/DELETE).
export async function GET() {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const enabled = await db.marketplaceEntry.findMany()
    const enabledMap = new Map(enabled.map((e) => [e.catalogId, e]))

    return NextResponse.json({
      catalog: MCP_CATALOG.map((entry) => {
        const dbEntry = enabledMap.get(entry.catalogId)
        return {
          ...entry,
          enabled: !!dbEntry?.enabled,
          port: dbEntry?.port ?? null,
          hasConfig: dbEntry?.config && dbEntry.config !== '{}',
        }
      }),
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to fetch marketplace: ' + (err instanceof Error ? err.message : '') },
      { status: 500 }
    )
  }
}
