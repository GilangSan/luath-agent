import type { ChatMessage, AIResponse, SenderInfo, ToolCall } from './types.js'
import { getToolSchemas, executeTool } from '../tools/index.js'
import { buildSystemPrompt } from './prompt.js'
import { getUserMemory } from './memory.js'

// Groq Config
const GROQ_API_KEY = process.env.GROQ_API_KEY
// RECOMMENDED: Use llama-3.3-70b-versatile for better rate limits on Groq free tier
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile'

// OpenRouter Config (Fallback)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-3.5-sonnet'

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Result returned by the runAgent function.
 */
export interface AgentResult {
  response: string
  messages: ChatMessage[]
}

/**
 * Utility function to fetch with automatic retries and exponential backoff.
 * Hardened for 429 (Rate Limit) errors.
 */
async function fetchWithRetry(url: string, options: any, retries = 5, backoff = 3000): Promise<Response> {
  try {
    const res = await fetch(url, options)
    
    if (!res.ok && retries > 0) {
      if (res.status === 429) {
        // 🛠️ Special handling for 429: wait longer or use retry-after header
        const retryAfter = res.headers.get('retry-after')
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : backoff
        console.warn(`[Agent] Rate limit hit (429). Retrying in ${waitMs}ms...`)
        await delay(waitMs)
        return fetchWithRetry(url, options, retries - 1, backoff * 1.5)
      }
      
      if (res.status >= 500) {
        console.warn(`[Agent] Server error (${res.status}). Retrying in ${backoff}ms...`)
        await delay(backoff)
        return fetchWithRetry(url, options, retries - 1, backoff * 1.5)
      }
    }
    return res
  } catch (err: any) {
    if (retries > 0 && (err.code === 'ECONNRESET' || err.message.includes('fetch failed'))) {
      console.warn(`[Agent] Network error. Retrying in ${backoff}ms...`)
      await delay(backoff)
      return fetchWithRetry(url, options, retries - 1, backoff * 1.5)
    }
    throw err
  }
}

/**
 * Fallback parser for models that output tool calls in text tags.
 */
function extractToolCallsFromText(text: string): ToolCall[] {
  const toolCalls: ToolCall[] = []
  const toolRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
  let match
  while ((match = toolRegex.exec(text)) !== null) {
    const name = match[1]
    const argsStr = match[2].trim()
    try {
      JSON.parse(argsStr)
      toolCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 11)}`,
        type: 'function',
        function: { name, arguments: argsStr }
      })
    } catch (e) {}
  }
  return toolCalls
}

/**
 * Runs the AI agent loop.
 */
export async function runAgent(
  history: ChatMessage[], 
  sender: SenderInfo, 
  usage: { count: number, limit: number }
): Promise<AgentResult> {
  const userMemory = await getUserMemory(sender.jid)
  const systemPrompt = buildSystemPrompt(sender, userMemory, usage)
  const toolSchemas = getToolSchemas()
  const newMessages: ChatMessage[] = []

  const useGroq = !!GROQ_API_KEY
  const apiUrl = useGroq ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions'
  const apiKey = useGroq ? GROQ_API_KEY : OPENROUTER_API_KEY
  const model = useGroq ? GROQ_MODEL : OPENROUTER_MODEL

  if (!apiKey) throw new Error('No AI API key found!')

  while (true) {
    const res = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(useGroq ? {} : { 'HTTP-Referer': 'https://github.com/wa-ai-agent', 'X-Title': process.env.BOT_NAME ?? 'WA AI Agent' })
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        temperature: 0.5,
        tools: toolSchemas,
        tool_choice: 'auto',
        messages: [{ role: 'system', content: systemPrompt }, ...history, ...newMessages]
      })
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`AI error ${res.status}: ${err}`)
    }

    const data: AIResponse = await res.json()
    const choice = data.choices[0]
    const assistantMsg = choice.message

    let toolCalls = assistantMsg.tool_calls || []
    if (toolCalls.length === 0 && assistantMsg.content) {
      toolCalls = extractToolCallsFromText(assistantMsg.content)
    }

    const assistantEntry: ChatMessage = {
      role: 'assistant',
      content: assistantMsg.content ?? '',
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
    }
    newMessages.push(assistantEntry)

    if (toolCalls.length === 0) {
      return { response: assistantMsg.content ?? '_(no response)_', messages: newMessages }
    }

    console.log(`🔧 Tool calls: ${toolCalls.map((t: ToolCall) => t.function.name).join(', ')}`)

    const toolResults = await Promise.all(
      toolCalls.map(async (tc: ToolCall) => {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        console.log(`   ⚡ ${tc.function.name}(${JSON.stringify(args)})`)
        try {
          const result = await executeTool(tc.function.name, args, { senderJid: sender.jid })
          console.log(`   ✅ ${tc.function.name} completed`)
          return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify(result), name: tc.function.name }
        } catch (err: any) {
          console.error(`   ❌ ${tc.function.name} failed: ${err.message}`)
          return { role: 'tool' as const, tool_call_id: tc.id, content: JSON.stringify({ success: false, error: err.message }), name: tc.function.name }
        }
      })
    )

    newMessages.push(...toolResults)
    
    // 🛠️ Optimization: Mandatory delay after tool results to respect RPM/TPM
    await delay(1500)
  }
}
