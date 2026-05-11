import type { Tool, ToolContext, ToolResult } from '../src/types.js'
import { setUserMemory } from '../src/memory.js'

/**
 * Tool to update the AI's long-term memory about a specific user.
 */
export const memoryTool: Tool = {
  schema: {
    type: 'function',
    function: {
      name: 'update_user_memory',
      description: 'Update or save important facts about the user to remember for future conversations. Only use this if you learn something significant (e.g., user name, preferences, birthday, location).',
      parameters: {
        type: 'object',
        properties: {
          memory: {
            type: 'string',
            description: 'The updated full memory string for this user. You should include existing facts you want to keep and add new ones.'
          }
        },
        required: ['memory']
      }
    }
  },

  /**
   * Saves the provided memory string to memory.json for the current sender.
   */
  async execute({ memory }, context: ToolContext): Promise<ToolResult> {
    if (!memory || typeof memory !== 'string') {
      return { success: false, error: 'Memory content is missing.' }
    }

    try {
      await setUserMemory(context.senderJid, memory)
      return {
        success: true,
        message: 'User memory updated successfully.'
      }
    } catch (err: any) {
      return { success: false, error: `Failed to save memory: ${err.message}` }
    }
  }
}
