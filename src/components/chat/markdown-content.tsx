'use client'

import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { CodeBlock } from '@/components/chat/code-block'

interface MarkdownContentProps {
  children: string
  /** Compact size for reasoning blocks (smaller text, tighter spacing) */
  compact?: boolean
}

/**
 * Shared markdown renderer used by:
 *   - the main assistant message body
 *   - the reasoning / thinking block
 *
 * Plugins:
 *   - remark-math + rehype-katex → inline ($A$) and display ($$...$$) LaTeX math
 *   - rehype-highlight          → syntax-highlighted fenced code blocks
 *
 * A custom `pre` renderer wraps fenced code in our CodeBlock (copy button +
 * dark surface + language label).
 */
export function MarkdownContent({ children, compact }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[
        rehypeKatex,
        [rehypeHighlight, { detect: true, ignoreMissing: true }],
      ]}
      components={{
        pre({ children, ...props }) {
          const codeEl = children as React.ReactElement<{ className?: string }> | undefined
          const codeClassName =
            codeEl && typeof codeEl === 'object' && 'props' in codeEl
              ? codeEl.props.className
              : undefined
          return <CodeBlock className={codeClassName}>{children}</CodeBlock>
        },
        code({ className, children, ...rest }) {
          const isBlock = /language-/.test(className || '')
          if (isBlock) {
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            )
          }
          return (
            <code
              className={`rounded bg-muted px-1.5 py-0.5 font-mono ${
                compact ? 'text-[0.85em]' : 'text-[0.85em]'
              }`}
              {...rest}
            >
              {children}
            </code>
          )
        },
        // Make math render slightly smaller in compact (reasoning) mode
        ...(compact
          ? {
              math({ children: mathChildren }: { children?: React.ReactNode }) {
                return <span className="text-[0.95em]">{mathChildren}</span>
              },
            }
          : {}),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
