/**
 * Normalized WhatsApp Message Structure
 */
export interface WAMessage {
  jid: string           // Destination JID (chat ID)
  senderJid: string     // Original sender JID (different in groups vs private)
  senderName: string    // User's pushName
  text: string          // Message content
  isGroup: boolean      // True if message is from a group
  mentionedBot: boolean // True if the bot was mentioned in the message
  hasPrefix: boolean    // True if the message starts with the defined prefix
}

/**
 * Chat Message Structure for AI Conversation History
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
  name?: string
}

/**
 * AI API Response Structure (Groq/OpenRouter compatible)
 */
export interface AIResponse {
  choices: Array<{
    message: {
      role: string
      content: string | null
      tool_calls?: ToolCall[]
    }
    finish_reason: 'stop' | 'tool_calls' | 'length'
  }>
}

/**
 * Structure for Tool Calls returned by the AI
 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/**
 * Context provided to tools during execution
 */
export interface ToolContext {
  senderJid: string
}

/**
 * Interface for Defining a Bot Tool
 */
export interface Tool {
  schema: {
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }
  /**
   * Executes the tool's logic
   * @param args Arguments parsed from the AI's tool call
   * @param context Context about the current interaction (e.g., sender info)
   */
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>
}

/**
 * Result returned by a tool execution
 */
export interface ToolResult {
  success: boolean
  error?: string
  [key: string]: unknown
}

/**
 * Sender Information used for building the system prompt context
 */
export interface SenderInfo {
  name: string
  jid: string
  isGroup: boolean
  groupName?: string
}
