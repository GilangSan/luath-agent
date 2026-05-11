import type { Tool, ToolContext, ToolResult } from '../src/types.js'

const BASE_URL = 'https://luath-api.isntlang.my.id'
const TIKTOK_FALLBACK_URL = 'http://api.azbry.com/api/download/tiktok?url='
const TIKTOK_SLIDE_URL = 'http://api.azbry.com/api/download/tiktokslide?url='

// Limits
const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024 // 250 MB
const MAX_RESOLUTION_HEIGHT = 1080

/**
 * Utility to wait for a specific duration.
 */
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * All-in-One Downloader tool with size and resolution limits.
 */
export const downloaderTool: Tool = {
  schema: {
    type: 'function',
    function: {
      name: 'all_in_one_downloader',
      description: 'Universal downloader for YouTube, TikTok, Instagram, etc. Limits: Max 1080p and 250MB file size.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL of the media to download.'
          }
        },
        required: ['url']
      }
    }
  },

  async execute({ url }, context: ToolContext): Promise<ToolResult> {
    if (!url || typeof url !== 'string') {
      return { success: false, error: 'Invalid URL.' }
    }

    const isTikTok = url.includes('tiktok.com')

    try {
      console.log(`[Downloader] Requesting extraction for: ${url}`)
      
      // Step 1: Try Primary (Luath API)
      const extractRes = await fetch(`${BASE_URL}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })

      if (extractRes.ok) {
        const info = await extractRes.json() as any
        let streams = info.streams || []

        // --- APPLY LIMITS ---
        streams = streams.filter((s: any) => {
          if (s.est_size_bytes && s.est_size_bytes > MAX_FILE_SIZE_BYTES) return false
          if (s.quality && typeof s.quality === 'string') {
            const match = s.quality.match(/(\d+)p|(\d+)x(\d+)/)
            if (match) {
              const height = parseInt(match[1] || match[3])
              if (height > MAX_RESOLUTION_HEIGHT) return false
            }
          }
          return true
        })

        if (streams.length > 0) {
          const bestStream = streams.find((s: any) => s.type === 'merged') || 
                             streams.find((s: any) => s.type === 'video') || 
                             streams.find((s: any) => s.type === 'audio') ||
                             streams[0]

          const startRes = await fetch(`${BASE_URL}/api/download/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url,
              stream_id: bestStream.stream_id,
              title: info.title,
              thumbnail: info.thumbnail,
              source: info.source,
              format: bestStream.format,
              quality: bestStream.quality
            })
          })

          if (startRes.ok) {
            const startData = await startRes.json() as any
            const jobId = startData.job_id
            if (jobId) {
              let status = 'queued'
              let attempts = 0
              while (status !== 'completed' && status !== 'failed' && attempts < 30) {
                await delay(1500)
                attempts++
                const statusRes = await fetch(`${BASE_URL}/api/download/status/${jobId}`)
                if (statusRes.ok) {
                  const statusData = await statusRes.json() as any
                  status = statusData.status
                  if (status === 'failed') break 
                }
              }

              if (status === 'completed') {
                let waType = 'document'
                if (bestStream.type === 'merged' || bestStream.type === 'video') waType = 'video'
                else if (bestStream.type === 'audio') waType = 'audio'
                const fileUrl = `${BASE_URL}/api/download/file/${jobId}`

                return {
                  success: true,
                  summary: `Download ready: ${info.title} (${bestStream.quality})`,
                  title: info.title,
                  source: info.source,
                  size_mb: bestStream.est_size_bytes ? (bestStream.est_size_bytes / (1024 * 1024)).toFixed(1) : 'Unknown',
                  media_marker: `[SEND_MEDIA:${waType}:${fileUrl}]`
                }
              }
            }
          }
        }
      }

      // Step 2: Fallback for TikTok (Azbry API)
      if (isTikTok) {
        console.log(`[Downloader] Trying Azbry fallback...`)
        
        // Try Slide Fallback
        try {
          const slideRes = await fetch(`${TIKTOK_SLIDE_URL}${encodeURIComponent(url)}`)
          if (slideRes.ok) {
            const slideData = await slideRes.json() as any
            if (slideData.status && slideData.result.images && slideData.result.images.length > 0) {
              const images = slideData.result.images.slice(0, 10)
              const markers = images.map((img: string) => `[SEND_MEDIA:image:${img}]`).join('\n')
              return {
                success: true,
                summary: `TikTok Slide: ${slideData.result.title}`,
                media_marker: markers
              }
            }
          }
        } catch (e) {}

        // Try Video Fallback
        const videoRes = await fetch(`${TIKTOK_FALLBACK_URL}${encodeURIComponent(url)}`)
        if (videoRes.ok) {
          const videoData = await videoRes.json() as any
          if (videoData.status && videoData.result) {
            // 🛠️ FIX: Prioritize 'nowm' or 'hd' to avoid black screen codec issues
            const res = videoData.result
            const videoUrl = res.nowm || res.hd || res.video || (res.links && res.links[0])
            
            if (videoUrl) {
              return {
                success: true,
                summary: `TikTok Video via Azbry: ${res.title || 'Untitled'}`,
                media_marker: `[SEND_MEDIA:video:${videoUrl}]`
              }
            }
          }
        }
      }

      throw new Error('Gagal mendownload media ini. File mungkin terlalu besar atau link tidak didukung.')

    } catch (err: any) {
      console.error(`[Downloader] Error: ${err.message}`)
      return { success: false, error: err.message }
    }
  }
}
