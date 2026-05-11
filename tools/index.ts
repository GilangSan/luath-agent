import type { Tool, ToolContext, ToolResult } from '../src/types.js'
import { downloaderTool } from './downloader.js'
import { weatherTool } from './weather.js'
import { memoryTool } from './memory.js'
import { youtubeSearchTool } from './youtube_search.js'
import { searchTool } from './search.js'
import { stickerTool } from './sticker.js'

/**
 * ── Tool Registry ─────────────────────────────────────────────────────
 */

const tools: Tool[] = [
  downloaderTool,
  weatherTool,
  memoryTool,
  youtubeSearchTool,
  searchTool,
  stickerTool
]

/**
 * Retrieves all registered tool schemas.
 */
export function getToolSchemas() {
  return tools.map(t => t.schema)
}

/**
 * Executes a tool by its function name.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext
): Promise<ToolResult> {
  const tool = tools.find(t => t.schema.function.name === name)

  if (!tool) {
    return { success: false, error: `Tool '${name}' not found` }
  }

  try {
    return await tool.execute(args, context)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Tool '${name}' execution error: ${errorMsg}` }
  }
}
