import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

// Max upload size: 10 MB (kept conservative for local LLM context)
const MAX_BYTES = 10 * 1024 * 1024

// Accepted file types — extension -> mime hint (we trust the extension)
const ACCEPTED: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

function getExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const ext = getExt(file.name)
    if (!ACCEPTED[ext]) {
      return NextResponse.json(
        { error: `Unsupported file type: ${ext || 'unknown'}. Accepted: ${Object.keys(ACCEPTED).join(', ')}` },
        { status: 400 }
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 10 MB.` },
        { status: 413 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let text = ''
    let truncated = false

    if (ext === '.pdf') {
      // pdf-parse v2: instantiate with buffer, call getText() (loads internally)
      const { PDFParse } = await import('pdf-parse')
      const pdf = new PDFParse(buffer)
      // getText() is public but load() is private — getText triggers load
      text = (await (pdf as unknown as { getText: () => Promise<string> }).getText()) || ''
    } else if (ext === '.docx') {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value || ''
    } else {
      // Plain text: txt, md, markdown, csv
      text = buffer.toString('utf-8')
    }

    // Trim + cap at ~50k chars to keep LLM context manageable
    text = text.replace(/\r\n/g, '\n').trim()
    const MAX_CHARS = 50000
    if (text.length > MAX_CHARS) {
      text = text.slice(0, MAX_CHARS) + '\n\n[... document truncated ...]'
      truncated = true
    }

    if (!text) {
      return NextResponse.json(
        { error: 'Could not extract any text from this file (it may be empty or scanned without OCR).' },
        { status: 422 }
      )
    }

    return NextResponse.json({
      name: file.name,
      ext,
      chars: text.length,
      truncated,
      text,
    })
  } catch (err) {
    console.error('Upload error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to process file: ${msg}` }, { status: 500 })
  }
}
