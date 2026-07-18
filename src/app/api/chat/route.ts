import { db } from '@/lib/db'
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export async function POST(request: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  try {
    const { messages, conversationId, model, temperature, maxTokens } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch LM Studio URL from settings, default to localhost:1234
    let lmStudioUrl = 'http://localhost:1234/v1'
    try {
      const urlSetting = await db.settings.findUnique({ where: { key: 'lmStudioUrl' } })
      if (urlSetting?.value) {
        lmStudioUrl = urlSetting.value.replace(/\/+$/, '') // Remove trailing slashes
      }
    } catch {
      // Use default
    }

    // Fetch model from settings if not provided
    let selectedModel = model || ''
    if (!selectedModel) {
      try {
        const modelSetting = await db.settings.findUnique({ where: { key: 'lmStudioModel' } })
        if (modelSetting?.value) {
          selectedModel = modelSetting.value
        }
      } catch {
        // Will be empty, LM Studio will use default
      }
    }

    const temp = temperature ?? 0.7
    const maxTokensVal = maxTokens ?? 2048

    // Save user message to DB
    if (conversationId) {
      const lastUserMsg = messages[messages.length - 1]
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await db.message.create({
          data: {
            role: 'user',
            content: lastUserMsg.content,
            conversationId,
          },
        })

        // Auto-title: use first user message if conversation is still "New Chat"
        const convo = await db.conversation.findUnique({ where: { id: conversationId } })
        if (convo && convo.title === 'New Chat') {
          const autoTitle = lastUserMsg.content.slice(0, 60) + (lastUserMsg.content.length > 60 ? '...' : '')
          await db.conversation.update({
            where: { id: conversationId },
            data: { title: autoTitle },
          })
        }
      }
    }

    // Build the request body for LM Studio (OpenAI-compatible)
    const requestBody: Record<string, unknown> = {
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: temp,
      max_tokens: maxTokensVal,
      stream: true,
    }

    if (selectedModel) {
      requestBody.model = selectedModel
    }

    // Try to connect to LM Studio
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout for initial connection

    let response: Response
    try {
      response = await fetch(`${lmStudioUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch (fetchError) {
      clearTimeout(timeout)
      const errorMsg = fetchError instanceof Error && fetchError.name === 'AbortError'
        ? `Connection to LM Studio timed out. Make sure LM Studio is running at ${lmStudioUrl}`
        : `Cannot connect to LM Studio at ${lmStudioUrl}. Make sure it's running and the server is started.`

      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(JSON.stringify({
        error: `LM Studio returned ${response.status}: ${errorText}`
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Stream the response back
    const encoder = new TextEncoder()
    let fullContent = ''

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }

        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith('data: ')) continue

              const data = trimmed.slice(6)
              if (data === '[DONE]') {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                continue
              }

              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content
                if (content) {
                  fullContent += content
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }

          // Process any remaining buffer
          if (buffer.trim()) {
            const trimmed = buffer.trim()
            if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
              try {
                const parsed = JSON.parse(trimmed.slice(6))
                const content = parsed.choices?.[0]?.delta?.content
                if (content) {
                  fullContent += content
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }
              } catch {
                // Skip
              }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (streamError) {
          controller.error(streamError)
        } finally {
          reader.releaseLock()

          // Save assistant message to DB after streaming is complete
          if (conversationId && fullContent) {
            try {
              await db.message.create({
                data: {
                  role: 'assistant',
                  content: fullContent,
                  conversationId,
                },
              })
            } catch {
              // Log but don't fail
            }
          }
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}