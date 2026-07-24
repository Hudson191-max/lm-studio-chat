/**
 * MCP server catalog for the marketplace.
 *
 * Each entry describes a known MCP server that users can one-click enable.
 * The orchestrator (scripts/start-all.js) reads enabled entries from the DB
 * at startup and spawns a bridge for each.
 *
 * Two bridge types are supported:
 *   - "supergateway" (Node, preferred): npx -y supergateway --stdio "<cmd>" --port <port>
 *   - "mcp-proxy" (Python, fallback): mcp-proxy --port <port> -- <cmd>
 *
 * The bridge detection logic lives in src/lib/mcp-bridge.ts.
 *
 * "configRequired" entries (like Google Calendar) need a Configure step
 * before they can be enabled. The config JSON is stored in MarketplaceEntry.config
 * and passed to the server via env vars or args (see `configToEnv` / `configToArgs`).
 */

export interface CatalogEntry {
  /** Stable ID used in the DB and API URLs. */
  catalogId: string
  /** Display name shown in the marketplace UI. */
  name: string
  /** Short description of what the server gives the AI. */
  description: string
  /** Category for grouping in the UI. */
  category: 'web' | 'developer' | 'knowledge' | 'data' | 'productivity'
  /** Icon emoji (no lucide dependency for simplicity). */
  icon: string
  /** Whether the user must provide config before enabling. */
  configRequired: boolean
  /** Runtime required: 'node' | 'python' | 'either'. */
  runtime: 'node' | 'python' | 'either'
  /**
   * The stdio command to run the MCP server (passed to the bridge).
   * For Node: 'npx -y @modelcontextprotocol/server-memory'
   * For Python: 'uvx mcp-server-time' or 'python -m mcp_server_fetch'
   * Use {CONFIG_VALUE} placeholders that get replaced from the config JSON.
   */
  command: string
  /** Default port (orchestrator assigns sequentially from 8770 if not set). */
  defaultPort?: number
  /**
   * Config field definitions — what the user must provide in the Configure step.
   * Empty array = zero config.
   */
  configFields?: Array<{
    key: string
    label: string
    type: 'text' | 'password' | 'path'
    placeholder?: string
    help?: string
    required: boolean
  }>
  /** How to apply the config: as env vars or as command-arg replacements. */
  configApply: 'env' | 'args'
  /** env var name mapping: { configKey: 'ENV_VAR_NAME' } (when configApply === 'env'). */
  envMapping?: Record<string, string>
}

export const MCP_CATALOG: CatalogEntry[] = [
  {
    catalogId: 'memory',
    name: 'Memory',
    description: 'Persistent knowledge graph — the AI remembers facts across conversations.',
    category: 'knowledge',
    icon: '🧠',
    configRequired: false,
    runtime: 'node',
    command: 'npx -y @modelcontextprotocol/server-memory',
    configApply: 'env',
  },
  {
    catalogId: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Step-by-step problem solving through dynamic thought sequences.',
    category: 'knowledge',
    icon: '🔗',
    configRequired: false,
    runtime: 'node',
    command: 'npx -y @modelcontextprotocol/server-sequential-thinking',
    configApply: 'env',
  },
  {
    catalogId: 'time',
    name: 'Time',
    description: 'Current time + timezone conversion. The AI always knows what time it is.',
    category: 'knowledge',
    icon: '⏰',
    configRequired: false,
    runtime: 'python',
    command: 'uvx mcp-server-time',
    configApply: 'env',
  },
  {
    catalogId: 'fetch',
    name: 'Fetch',
    description: 'Web content fetching + markdown conversion. Lighter than Hound, no browser.',
    category: 'web',
    icon: '📡',
    configRequired: false,
    runtime: 'python',
    command: 'uvx mcp-server-fetch',
    configApply: 'env',
  },
  {
    catalogId: 'hound',
    name: 'Hound Web Search',
    description: 'Free keyless web search + fetch + crawl + PDF/OCR. Already bundled — just register it.',
    category: 'web',
    icon: '🐕',
    configRequired: false,
    runtime: 'python',
    command: 'hound --http --port {PORT}',  // special: Hound has native --http, no bridge needed
    configApply: 'env',
  },
  {
    catalogId: 'google-calendar',
    name: 'Google Calendar',
    description: 'View, create, and manage Google Calendar events. Requires Google Cloud OAuth credentials.',
    category: 'productivity',
    icon: '📅',
    configRequired: true,
    runtime: 'node',
    command: 'npx -y google-calendar-mcp',
    configApply: 'env',
    configFields: [
      {
        key: 'clientId',
        label: 'OAuth Client ID',
        type: 'text',
        placeholder: 'xxxxx.apps.googleusercontent.com',
        help: 'From Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID',
        required: true,
      },
      {
        key: 'clientSecret',
        label: 'OAuth Client Secret',
        type: 'password',
        placeholder: 'GOCSPX-xxxxx',
        help: 'The secret that pairs with your Client ID. Keep this private.',
        required: true,
      },
    ],
    envMapping: {
      clientId: 'GOOGLE_CLIENT_ID',
      clientSecret: 'GOOGLE_CLIENT_SECRET',
    },
  },
]

/** Look up a catalog entry by ID. */
export function getCatalogEntry(catalogId: string): CatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.catalogId === catalogId)
}
