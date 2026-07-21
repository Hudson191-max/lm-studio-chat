import { db } from '@/lib/db'

interface ToolCallData {
  index: number
  id: string
  type: string
  function: { name: string; arguments: string }
}
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

interface IncomingMessage {
  role: string
  content: string
  images?: string[]
  tool_calls?: unknown[]
  tool_call_id?: string
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAuth()
  if (error) return error

  try {
    const {
      messages,
      conversationId,
      model,
      temperature,
      maxTokens,
      systemPrompt,
      mcpTools,
      regenerate,
    } = await request.json() as {
      messages: IncomingMessage[]
      conversationId?: string
      model?: string
      temperature?: number
      maxTokens?: number
      systemPrompt?: string
      mcpTools?: unknown[]
      regenerate?: boolean
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Messages are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Fetch settings
    let lmStudioUrl = 'http://localhost:1234/v1'
    let selectedModel = model || ''
    let temp = temperature ?? 0.7
    let maxTokensVal = maxTokens ?? 2048
    let convoSystemPrompt = systemPrompt || ''

    try {
      const settings = await db.settings.findMany({
        where: { userId: session!.user.id },
      })
      const map: Record<string, string> = {}
      for (const s of settings) map[s.key] = s.value
      if (map.lmStudioUrl) lmStudioUrl = map.lmStudioUrl.replace(/\/+$/, '')
      if (!selectedModel && map.lmStudioModel) selectedModel = map.lmStudioModel
      if (map.temperature) temp = parseFloat(map.temperature)
      if (map.maxTokens) maxTokensVal = parseInt(map.maxTokens)
    } catch {
      // Use defaults
    }

    // Get conversation for system prompt and profile override
    if (conversationId) {
      try {
        const convo = await db.conversation.findUnique({
          where: { id: conversationId },
          include: { profile: true },
        })
        if (convo) {
          if (convo.systemPrompt && !convoSystemPrompt) {
            convoSystemPrompt = convo.systemPrompt
          }
          if (convo.profile) {
            if (convo.profile.url) lmStudioUrl = convo.profile.url.replace(/\/+$/, '')
            if (convo.profile.model && !selectedModel) selectedModel = convo.profile.model
            if (convo.profile.temperature) temp = convo.profile.temperature
            if (convo.profile.maxTokens) maxTokensVal = convo.profile.maxTokens
          }
        }
      } catch {
        // skip
      }
    }

    // Build final messages array with system prompt
    // Support vision format: content can be string | array of content parts
    const apiMessages: { role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>; tool_calls?: unknown[]; tool_call_id?: string }[] = []
    if (convoSystemPrompt) {
      apiMessages.push({ role: 'system', content: convoSystemPrompt })
    }
    for (const m of messages) {
      // If user message has images, use OpenAI vision format
      if (m.role === 'user' && m.images && m.images.length > 0) {
        const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
        for (const imgUrl of m.images) {
          contentParts.push({ type: 'image_url', image_url: { url: imgUrl } })
        }
        if (m.content) {
          contentParts.push({ type: 'text', text: m.content })
        }
        apiMessages.push({ role: m.role, content: contentParts })
      } else {
        apiMessages.push({ role: m.role, content: m.content })
      }
    }

    // Build request body
    const requestBody: Record<string, unknown> = {
      messages: apiMessages,
      temperature: temp,
      max_tokens: maxTokensVal,
      stream: true,
    }

    if (selectedModel) requestBody.model = selectedModel

    // Add MCP tools if available
    const tools = mcpTools || []
    if (tools.length > 0) {
      requestBody.tools = (tools as Array<{ name: string; description?: string; inputSchema?: unknown }>).map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.inputSchema || { type: 'object', properties: {} },
        },
      }))
    }

    // Save user message to DB (skip if regenerating)
    if (conversationId && !regenerate) {
      const lastUserMsg = messages[messages.length - 1]
      if (lastUserMsg && lastUserMsg.role === 'user') {
        await db.message.create({
          data: {
            role: 'user',
            content: lastUserMsg.content || '',
            images: JSON.stringify(lastUserMsg.images || []),
            conversationId,
          },
        })
        // Auto-title
        const convo = await db.conversation.findUnique({ where: { id: conversationId } })
        if (convo && convo.title === 'New Chat') {
          const autoTitle = (lastUserMsg.content || '').slice(0, 60) + ((lastUserMsg.content || '').length > 60 ? '...' : '')
          await db.conversation.update({
            where: { id: conversationId },
            data: { title: autoTitle },
          })
        }
      }
    }

    // Connect to LM Studio
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    let response: Response
    try {
      response = await fetch(`${lmStudioUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch (fetchError) {
      clearTimeout(timeout)
      const errorMsg =
        fetchError instanceof Error && fetchError.name === 'AbortError'
          ? `Connection to LM Studio timed out. Make sure LM Studio is running at ${lmStudioUrl}`
          : `Cannot connect to LM Studio at ${lmStudioUrl}. Make sure it's running and the server is started.`

      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!response.ok) {
      const errorText = await response.text()
      return new Response(
        JSON.stringify({ error: `LM Studio returned ${response.status}: ${errorText}` }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Stream the response
    const encoder = new TextEncoder()
    let fullContent = ''
    let fullThinking = ''
    let toolCallsData: ToolCallData[] = []

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
                const parsed = JSON.parse(data) as {
                  choices?: Array<{
                    delta?: {
                      content?: string
                      reasoning_content?: string
                      tool_calls?: Array<{
                        index: number
                        id?: string
                        function?: { name?: string; arguments?: string }
                      }>
                    }
                  }>
                }
                const delta = parsed.choices?.[0]?.delta

                // Handle reasoning/thinking content (e.g. DeepSeek R1)
                const reasoning = delta?.reasoning_content
                if (reasoning) {
                  fullThinking += reasoning
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`))
                }

                // Handle content
                const content = delta?.content
                if (content) {
                  fullContent += content
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                }

                // Handle tool calls (streaming)
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls as ToolCallData[]) {
                    if (!toolCallsData[tc.index]) {
                      toolCallsData[tc.index] = {
                        index: tc.index,
                        id: tc.id || '',
                        type: 'function',
                        function: { name: tc.function?.name || '', arguments: '' },
                      }
                    }
                    if (tc.id) toolCallsData[tc.index].id = tc.id
                    if (tc.function?.name) toolCallsData[tc.index].function.name += tc.function.name
                    if (tc.function?.arguments) toolCallsData[tc.index].function.arguments += tc.function.arguments
                  }
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ toolCalls: toolCallsData })}\n\n`)
                  )
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }

          // Process remaining buffer
          if (buffer.trim()) {
            const trimmed = buffer.trim()
            if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
              try {
                const parsed = JSON.parse(trimmed.slice(6))
                const content = parsed.choices?.[0]?.delta?.content
                const reasoning = parsed.choices?.[0]?.delta?.reasoning_content
                if (reasoning) {
                  fullThinking += reasoning
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`))
                }
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

          // Save assistant message to DB
          if (conversationId && (fullContent || fullThinking)) {
            try {
              await db.message.create({
                data: {
                  role: 'assistant',
                  content: fullContent,
                  thinking: fullThinking,
                  conversationId,
                  toolCalls: JSON.stringify(toolCallsData),
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
  } catch {
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}