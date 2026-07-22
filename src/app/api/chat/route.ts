import { db } from '@/lib/db'
import { callMcpTool } from '@/lib/mcp-client'

interface ToolCallData {
  index: number
  id: string
  type: string
  function: { name: string; arguments: string }
}
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

interface IncomingMessage {
  role: string
  content: string
  images?: string[]
  files?: Array<{ name: string; ext: string; chars: number; truncated?: boolean }>
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

    // Get conversation for system prompt and profile override (verify ownership)
    if (conversationId) {
      try {
        const convo = await db.conversation.findFirst({
          where: { id: conversationId, userId: session!.user.id },
          include: { profile: true },
        })
        if (!convo) {
          return new Response(JSON.stringify({ error: 'Conversation not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (convo.systemPrompt && !convoSystemPrompt) {
          convoSystemPrompt = convo.systemPrompt
        }
        if (convo.profile) {
          if (convo.profile.url) lmStudioUrl = convo.profile.url.replace(/\/+$/, '')
          if (convo.profile.model && !selectedModel) selectedModel = convo.profile.model
          if (convo.profile.temperature) temp = convo.profile.temperature
          if (convo.profile.maxTokens) maxTokensVal = convo.profile.maxTokens
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
        // Store images AND files metadata in the `images` JSON column as a unified object.
        // The parser in sidebar.tsx handles both legacy array format and new object format.
        const attachmentData = JSON.stringify({
          images: lastUserMsg.images || [],
          files: lastUserMsg.files || [],
        })
        await db.message.create({
          data: {
            role: 'user',
            content: lastUserMsg.content || '',
            images: attachmentData,
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

    // Stream the response with tool-call execution loop.
    // When the model emits tool_calls, we execute them via MCP, then re-call
    // the model with the tool results, up to a max of 5 rounds.
    const encoder = new TextEncoder()
    let fullContent = ''
    let fullThinking = ''
    let allToolCalls: ToolCallData[] = []

    // The messages array we send to LM Studio grows with each tool round:
    // original messages + assistant tool_calls + tool results.
    let currentMessages = [...apiMessages]
    // The tools list (with MCP server URLs) for execution
    const mcpToolList = (tools as Array<{ name: string; description?: string; inputSchema?: unknown; _url?: string; url?: string }>)

    const stream = new ReadableStream({
      async start(streamController) {
        const MAX_TOOL_ROUNDS = 5

        try {
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            // Build the request body for this round
            const roundBody: Record<string, unknown> = {
              messages: currentMessages,
              temperature: temp,
              max_tokens: maxTokensVal,
              stream: true,
            }
            if (selectedModel) roundBody.model = selectedModel
            if (mcpToolList.length > 0) {
              roundBody.tools = mcpToolList.map((t) => ({
                type: 'function',
                function: {
                  name: t.name,
                  description: t.description || '',
                  parameters: t.inputSchema || { type: 'object', properties: {} },
                },
              }))
            }

            // Call LM Studio
            const roundController = new AbortController()
            const roundTimeout = setTimeout(() => roundController.abort(), 120000)
            let response: Response
            try {
              response = await fetch(`${lmStudioUrl}/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roundBody),
                signal: roundController.signal,
              })
              clearTimeout(roundTimeout)
            } catch (fetchError) {
              clearTimeout(roundTimeout)
              const errorMsg =
                fetchError instanceof Error && fetchError.name === 'AbortError'
                  ? `Connection to LM Studio timed out.`
                  : `Cannot connect to LM Studio at ${lmStudioUrl}.`
              streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`))
              break
            }

            if (!response.ok) {
              const errorText = await response.text()
              streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ error: `LM Studio ${response.status}: ${errorText.slice(0, 200)}` })}\n\n`))
              break
            }

            // Parse the streaming response, accumulate tool calls
            const reader = response.body?.getReader()
            if (!reader) break
            const decoder = new TextDecoder()
            let buffer = ''
            let roundContent = ''
            let roundThinking = ''
            let roundToolCalls: ToolCallData[] = []

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
                if (data === '[DONE]') continue
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
                    usage?: {
                      prompt_tokens?: number
                      completion_tokens?: number
                      total_tokens?: number
                    }
                  }
                  const delta = parsed.choices?.[0]?.delta

                  // Capture token usage (LM Studio sends it in the last chunk)
                  if (parsed.usage) {
                    const usage = {
                      promptTokens: parsed.usage.prompt_tokens || 0,
                      completionTokens: parsed.usage.completion_tokens || 0,
                      totalTokens: parsed.usage.total_tokens || 0,
                    }
                    streamController.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ tokenUsage: usage })}\n\n`)
                    )
                  }
                  const reasoning = delta?.reasoning_content
                  if (reasoning) {
                    roundThinking += reasoning
                    fullThinking += reasoning
                    streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`))
                  }
                  const content = delta?.content
                  if (content) {
                    roundContent += content
                    fullContent += content
                    streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`))
                  }
                  if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls as ToolCallData[]) {
                      if (!roundToolCalls[tc.index]) {
                        roundToolCalls[tc.index] = {
                          index: tc.index,
                          id: tc.id || '',
                          type: 'function',
                          function: { name: tc.function?.name || '', arguments: '' },
                        }
                      }
                      if (tc.id) roundToolCalls[tc.index].id = tc.id
                      // Tool name: set only if empty (some models resend the name
                      // in every chunk, which would duplicate it with +=)
                      if (tc.function?.name && !roundToolCalls[tc.index].function.name) {
                        roundToolCalls[tc.index].function.name = tc.function.name
                      }
                      // Arguments: always append (genuinely streamed in pieces)
                      if (tc.function?.arguments) roundToolCalls[tc.index].function.arguments += tc.function.arguments
                    }
                  }
                } catch {
                  // skip malformed
                }
              }
            }
            reader.releaseLock()

            // Clean up empty tool call slots
            roundToolCalls = roundToolCalls.filter(Boolean)
            const hasToolCalls = roundToolCalls.length > 0

            if (!hasToolCalls) {
              // No tool calls — we're done
              break
            }

            // Accumulate tool calls for storage
            allToolCalls.push(...roundToolCalls)

            // Notify client of tool calls
            streamController.enqueue(
              encoder.encode(`data: ${JSON.stringify({ toolCalls: roundToolCalls })}\n\n`)
            )

            // Add the assistant message (with tool_calls) to the conversation
            currentMessages.push({
              role: 'assistant',
              content: roundContent || '',
              tool_calls: roundToolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.function.name, arguments: tc.function.arguments },
              })),
            } as IncomingMessage)

            // Execute each tool call via MCP
            for (const tc of roundToolCalls) {
              const toolName = tc.function.name
              let toolArgs: Record<string, unknown> = {}
              try {
                toolArgs = JSON.parse(tc.function.arguments || '{}')
              } catch (e) {
                console.error(`[chat] Failed to parse tool args for ${toolName}:`, tc.function.arguments)
              }

              // Find the MCP server URL for this tool
              const toolDef = mcpToolList.find((t) => t.name === toolName)
              const mcpUrl = toolDef?._url || toolDef?.url
              if (!mcpUrl) {
                console.error(`[chat] No MCP server URL found for tool: ${toolName}`)
                streamController.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ toolResult: { name: toolName, error: `No MCP server URL for tool ${toolName}` } })}\n\n`)
                )
                currentMessages.push({
                  role: 'tool',
                  content: `Error: no MCP server URL for tool ${toolName}`,
                  tool_call_id: tc.id,
                } as IncomingMessage)
                continue
              }

              console.log(`[chat] Executing tool ${toolName} on ${mcpUrl} with args:`, JSON.stringify(toolArgs).slice(0, 200))

              streamController.enqueue(
                encoder.encode(`data: ${JSON.stringify({ toolExecuting: { name: toolName, args: toolArgs } })}\n\n`)
              )

              const result = await callMcpTool(mcpUrl, toolName, toolArgs)

              console.log(`[chat] Tool ${toolName} returned ${result.content.length} chars (isError=${result.isError})`)

              streamController.enqueue(
                encoder.encode(`data: ${JSON.stringify({ toolResult: { name: toolName, content: result.content.slice(0, 2000), isError: result.isError } })}\n\n`)
              )

              currentMessages.push({
                role: 'tool',
                content: result.content.slice(0, 8000),  // cap to avoid context overflow
                tool_call_id: tc.id,
              } as IncomingMessage)
            }

            // Loop continues — call LM Studio again with the tool results
          }

          streamController.enqueue(encoder.encode('data: [DONE]\n\n'))
          streamController.close()
        } catch (streamError) {
          streamController.error(streamError)
        } finally {
          // Save assistant message to DB
          if (conversationId && (fullContent || fullThinking)) {
            try {
              await db.message.create({
                data: {
                  role: 'assistant',
                  content: fullContent,
                  thinking: fullThinking,
                  conversationId,
                  toolCalls: JSON.stringify(allToolCalls),
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
  } catch (err) {
    return NextResponse.json(
      { error: 'An unexpected error occurred: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    )
  }
}