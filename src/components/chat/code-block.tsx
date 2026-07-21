'use client'

import { useState, useRef, useCallback, ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface CodeBlockProps {
  className?: string
  children?: ReactNode
}

/**
 * Wraps a fenced code block (` ```lang ... ``` `) rendered by react-markdown.
 *
 * rehype-highlight has already converted the raw text inside <code> into
 * highlighted <span> tokens by the time this component renders, so we don't
 * touch the children — we just provide:
 *   - a dark surface (always dark, like ChatGPT / GitHub code cards)
 *   - a language label in the top-right
 *   - a copy button that copies the raw text via a ref + textContent
 */
export function CodeBlock({ className, children }: CodeBlockProps) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const language = (() => {
    const match = /language-(\w+)/.exec(className || '')
    return match ? match[1] : ''
  })()

  const handleCopy = useCallback(async () => {
    const text = preRef.current?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API may be unavailable (e.g. insecure context) — fail silently
    }
  }, [])

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg border border-border/60 bg-[#0d1117] text-[#e6edf3]">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          {language || 'code'}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 gap-1 px-2 text-[11px] text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
          tabIndex={-1}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre
        ref={preRef}
        className="overflow-x-auto p-3 text-[13px] leading-relaxed"
        style={{ scrollbarWidth: 'thin' }}
      >
        {children}
      </pre>
    </div>
  )
}
