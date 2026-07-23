'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

export interface ToolCallEntry {
  id?: string
  name: string
  args?: Record<string, unknown>
  content?: string
  isError?: boolean
  isExecuting?: boolean
  timestamp?: number
}

/**
 * Renders a single MCP tool call as a collapsible card.
 *
 * Collapsed: shows tool name + arg summary + status icon
 * Expanded: shows the full returned content (truncated to 2000 chars with a "show more" toggle)
 *
 * The args are formatted smartly: picks the most relevant arg (query, url, q, search)
 * and shows it as `name("value")` instead of `name({"query":"value"})`.
 */
export function ToolCallBlock({ entry }: { entry: ToolCallEntry }) {
  const [expanded, setExpanded] = useState(false)
  const [showFull, setShowFull] = useState(false)

  const argSummary = formatArgs(entry.name, entry.args)
  const content = entry.content || ''
  const truncated = !showFull && content.length > 2000
  const displayContent = truncated ? content.slice(0, 2000) : content

  return (
    <div className="my-2 ml-12 rounded-lg border border-border/60 bg-muted/30 overflow-hidden text-xs">
      {/* Header row — always visible, click to expand */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
      >
        {expanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
        <Wrench className="h-3 w-3 shrink-0 text-primary" />
        <span className="font-mono font-medium shrink-0">{entry.name}</span>
        {argSummary && (
          <span className="text-muted-foreground truncate flex-1">{argSummary}</span>
        )}
        {/* Status icon on the right */}
        <span className="shrink-0 ml-auto">
          {entry.isExecuting ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : entry.isError ? (
            <XCircle className="h-3 w-3 text-destructive" />
          ) : content ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          ) : null}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && content && (
        <div className="border-t border-border/40">
          <div className="px-3 py-2 max-h-64 overflow-y-auto">
            <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground font-mono" style={{ scrollbarWidth: 'thin' }}>
              {displayContent}
            </pre>
            {truncated && (
              <button
                onClick={() => setShowFull(true)}
                className="mt-2 text-[10px] text-primary hover:underline"
              >
                Show all {content.length.toLocaleString()} chars ↓
              </button>
            )}
            {!truncated && showFull && content.length > 2000 && (
              <button
                onClick={() => setShowFull(false)}
                className="mt-2 text-[10px] text-primary hover:underline"
              >
                Show less ↑
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Format tool arguments into a concise summary.
 * Picks the most "interesting" arg (query, url, q, search, name) and shows it.
 *
 *   smart_search({query: "latest AI news"}) → "(latest AI news)"
 *   smart_fetch({url: "https://example.com"}) → "(https://example.com)"
 *   version({}) → ""
 */
function formatArgs(toolName: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return ''

  // Priority order — pick the first one that exists
  const priorityKeys = ['query', 'q', 'search', 'url', 'name', 'text', 'message', 'prompt']
  for (const key of priorityKeys) {
    if (args[key] !== undefined && args[key] !== '') {
      const val = String(args[key])
      // Truncate long values
      const truncated = val.length > 60 ? val.slice(0, 60) + '…' : val
      return `(${truncated})`
    }
  }

  // Fallback: show the first arg as key="value"
  const firstKey = Object.keys(args)[0]
  if (firstKey) {
    const val = String(args[firstKey])
    const truncated = val.length > 40 ? val.slice(0, 40) + '…' : val
    return `(${firstKey}="${truncated}")`
  }

  return ''
}
