import type { Tool, ToolContext, ToolResult } from '../src/types.js'

const EXA_API_KEY = process.env.EXA_API_KEY

/**
 * Utility to calculate start date based on recency.
 */
function getStartDate(recency?: string): string | undefined {
  if (!recency) return undefined
  const now = new Date()
  const map: Record<string, number> = {
    day: 1, week: 7, month: 30, year: 365
  }
  now.setDate(now.getDate() - (map[recency] ?? 7))
  return now.toISOString()
}

/**
 * Tool to search the web using Exa AI Search API.
 * Optimized for token usage and strict type validation.
 */
export const searchTool: Tool = {
  schema: {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Cari informasi terkini di internet menggunakan Exa Search. Gunakan saat butuh berita terbaru, fakta, riset, atau informasi yang kamu tidak yakin kebenarannya.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'kata kunci pencarian'
          },
          type: {
            type: 'string',
            enum: ['neural', 'keyword'],
            description: '"neural" (default) untuk pertanyaan natural, "keyword" untuk istilah spesifik/nama.'
          },
          num_results: {
            type: 'number',
            description: 'PENTING: Harus berupa angka murni tanpa tanda kutip. Contoh: 3'
          },
          recency: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year'],
            description: 'filter waktu (day, week, month, year)'
          }
        },
        required: ['query']
      }
    }
  },

  async execute({ query, type = 'neural', num_results = 3, recency }, context: ToolContext): Promise<ToolResult> {
    if (!EXA_API_KEY) {
      return { success: false, error: 'EXA_API_KEY tidak valid atau belum diset di .env' }
    }

    if (!query || typeof query !== 'string') {
      return { success: false, error: 'Query is required.' }
    }

    // 🛠️ Type hardening: some models pass numbers as strings
    const limit = Math.max(1, Math.min(Number(num_results) || 3, 5))
    const startDate = getStartDate(recency as string)

    try {
      console.log(`[Exa Search] Searching for: ${query} (Type: ${type}, Limit: ${limit})`)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': EXA_API_KEY
        },
        signal: controller.signal,
        body: JSON.stringify({
          query,
          type,
          numResults: limit,
          startPublishedDate: startDate,
          contents: {
            text: {
              maxCharacters: 400,
              includeHtmlTags: false
            },
            highlights: {
              numSentences: 2,
              highlightsPerUrl: 1
            }
          }
        })
      })

      clearTimeout(timeoutId)

      if (res.status === 401) return { success: false, error: 'EXA_API_KEY tidak valid' }
      if (res.status === 429) return { success: false, error: 'Kuota Exa Search habis' }
      if (!res.ok) return { success: false, error: `Exa error ${res.status}` }

      const data = await res.json() as any
      
      const results = (data.results || []).map((item: any) => {
        const hostname = item.url ? new URL(item.url).hostname : 'Unknown'
        const summary = (item.highlights && item.highlights.length > 0)
          ? item.highlights.join(' ')
          : (item.text ? item.text.slice(0, 300) : 'No summary.')

        return {
          title: item.title?.slice(0, 80) || 'No Title',
          url: item.url,
          source: hostname,
          summary: summary.slice(0, 350)
        }
      })

      return {
        success: true,
        query,
        results
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return { success: false, error: 'Exa timeout' }
      return { success: false, error: err.message }
    }
  }
}
