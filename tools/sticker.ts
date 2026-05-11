import type { Tool, ToolContext, ToolResult } from '../src/types.js'

/**
 * Tool to convert an image URL into a WhatsApp sticker.
 */
export const stickerTool: Tool = {
  schema: {
    type: 'function',
    function: {
      name: 'create_sticker',
      description: 'Buat stiker WhatsApp dari URL gambar. Gunakan jika user mengirim link gambar atau meminta dibuatkan stiker dari hasil pencarian.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL gambar yang ingin dijadikan stiker.'
          }
        },
        required: ['url']
      }
    }
  },

  async execute({ url }, context: ToolContext): Promise<ToolResult> {
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'URL gambar tidak valid.' }
    }

    // We use a special marker that the bot.ts will catch and handle as a sticker message
    return {
      success: true,
      summary: 'Stiker sedang diproses...',
      media_marker: `[SEND_STICKER:${url}]`
    }
  }
}
