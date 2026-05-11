import type { Tool, ToolContext, ToolResult } from '../src/types.js'
import yts from 'yt-search'

/**
 * Tool to search for YouTube videos.
 */
export const youtubeSearchTool: Tool = {
  schema: {
    type: 'function',
    function: {
      name: 'youtube_search',
      description: 'Search for videos on YouTube. Returns a list of videos with their titles, URLs, durations, and views. Use this when the user asks to find or search for a video.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search term (e.g., "lagu lathi", "tutorial masak", etc.)'
          },
          limit: {
            type: 'number',
            description: 'Number of results to return (default: 5)'
          }
        },
        required: ['query']
      }
    }
  },

  /**
   * Executes the YouTube search using yt-search.
   */
  async execute({ query, limit = 5 }, context: ToolContext): Promise<ToolResult> {
    if (!query || typeof query !== 'string') {
      return { success: false, error: 'Query is required.' }
    }

    try {
      console.log(`[YT Search] Searching for: ${query}`)
      const r = await yts(query)
      const videos = r.videos.slice(0, Number(limit))

      if (videos.length === 0) {
        return { success: true, message: 'No videos found for this query.', results: [] }
      }

      return {
        success: true,
        results: videos.map(v => ({
          title: v.title,
          url: v.url,
          duration: v.timestamp,
          views: v.views,
          author: v.author.name,
          ago: v.ago,
          thumbnail: v.thumbnail
        }))
      }
    } catch (err: any) {
      console.error(`[YT Search] Error: ${err.message}`)
      return { success: false, error: err.message }
    }
  }
}
