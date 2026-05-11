import { 
  WASocket, 
  proto, 
  downloadMediaMessage 
} from '@whiskeysockets/baileys'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import type { WAMessage, ChatMessage, SenderInfo } from './types.js'
import { runAgent } from './agent.js'
import { getUsage, incrementUsage } from './limits.js'

// In-memory conversation history per user
const histories = new Map<string, ChatMessage[]>()
// Tracking last request time per user
const lastRequestTime = new Map<string, number>()

const MAX_HISTORY = parseInt(process.env.MAX_HISTORY ?? '10') 
const REQUEST_COOLDOWN_MS = 2500
const DAILY_MESSAGE_LIMIT = 50
const BOT_START_TIME = Date.now()

// Regex patterns
const URL_PATTERNS: Record<string, RegExp> = {
  youtube: /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  tiktok: /tiktok\.com\/@[\w.]+\/video\/\d+|vm\.tiktok\.com\/\w+/,
  instagram: /instagram\.com\/(?:p|reel|stories)\/[\w-]+/,
  twitter: /twitter\.com\/[\w]+\/status\/\d+/,
  generic: /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
}

const MEDIA_MARKER_REGEX = /\[SEND_MEDIA:(video|image|audio|document):([^\]\s]+)\]/gi
const STICKER_MARKER_REGEX = /\[SEND_STICKER:([^\]\s]+)\]/gi

/**
 * Main handler for incoming WhatsApp messages.
 */
export async function handleMessage(sock: WASocket, raw: proto.IWebMessageInfo) {
  const parsed = parseMessage(sock, raw)
  if (!parsed) return

  const { jid, senderJid, senderName, text, isGroup, mentionedBot, hasPrefix } = parsed

  if (isGroup && !mentionedBot && !hasPrefix) return

  const cleanText = hasPrefix ? text.slice(1).trim() : text.trim()
  const lowerText = cleanText.toLowerCase()
  
  // 🚀 FEATURE: Status Command
  if (lowerText === 'status') {
    const usage = await getUsage(senderJid)
    const uptimeSec = Math.floor((Date.now() - BOT_START_TIME) / 1000)
    const uptimeStr = uptimeSec > 3600 ? `${(uptimeSec/3600).toFixed(1)} jam` : `${Math.floor(uptimeSec/60)} menit`
    
    const statusText = `📊 *STATUS BOT*\n\n` +
      `👤 *User:* ${senderName}\n` +
      `✉️ *Usage:* ${usage.count}/${DAILY_MESSAGE_LIMIT} pesan hari ini\n` +
      `⏳ *Uptime:* ${uptimeStr}\n` +
      `🤖 *Model:* ${process.env.GROQ_MODEL || 'llama-3.3-70b'}\n` +
      `🛡️ *Owner:* ${process.env.OWNER_NAME || 'Lang'}`
    
    await sock.sendMessage(jid, { text: statusText }, { quoted: raw }).catch(() => {})
    return
  }

  // 🚀 FEATURE: Direct Sticker Command
  if (lowerText === 's' || lowerText === 'sticker' || lowerText === 'stiker') {
    const isMedia = !!(raw.message?.imageMessage || raw.message?.videoMessage)
    const isReplyMedia = !!(raw.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage || 
                            raw.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage)
    
    if (isMedia || isReplyMedia) {
      await sock.sendMessage(jid, { react: { text: '⏳', key: raw.key } }).catch(() => {})
      try {
        const buffer = await downloadMediaMessage(
          isReplyMedia ? { message: raw.message!.extendedTextMessage!.contextInfo!.quotedMessage } as any : raw,
          'buffer',
          {}
        ) as Buffer

        const sticker = new Sticker(buffer, {
          pack: process.env.BOT_NAME || 'Luath',
          author: process.env.OWNER_NAME || 'Lang',
          type: StickerTypes.FULL,
          quality: 70
        })

        await sock.sendMessage(jid, { sticker: await sticker.toBuffer() }, { quoted: raw })
        await sock.sendMessage(jid, { react: { text: '✅', key: raw.key } }).catch(() => {})
        return
      } catch (err) {
        console.error('[Bot] Sticker conversion failed:', err)
      }
    }
  }

  if (!cleanText) return

  const now = Date.now()
  
  // ── Persistent Daily Limit Check ────────────────────────────────
  const usage = await getUsage(senderJid)
  if (usage.count >= DAILY_MESSAGE_LIMIT) {
    await sock.sendMessage(jid, { text: `⚠️ Kamu telah mencapai batas harian (${DAILY_MESSAGE_LIMIT} pesan). Silakan coba lagi besok!` }, { quoted: raw }).catch(() => {})
    return
  }

  const lastTime = lastRequestTime.get(senderJid) || 0
  if (now - lastTime < REQUEST_COOLDOWN_MS) return 
  lastRequestTime.set(senderJid, now)

  // Increment and persist usage count
  await incrementUsage(senderJid)
  
  // Get latest usage for the agent
  const currentUsage = await getUsage(senderJid)
  const usageForAgent = { count: currentUsage.count, limit: DAILY_MESSAGE_LIMIT }

  const truncatedText = cleanText.length > 600 ? cleanText.slice(0, 600) + '...' : cleanText
  await sock.sendPresenceUpdate('composing', jid).catch(() => {})

  if (!histories.has(senderJid)) histories.set(senderJid, [])
  const history = histories.get(senderJid)!

  const hasImage = !!(raw.message?.imageMessage || raw.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage)
  const detectedUrl = detectMediaUrl(truncatedText)
  
  let messageForAgent = truncatedText
  if (detectedUrl) messageForAgent += `\n\n[System: media ${detectedUrl.type} link: ${detectedUrl.url}]`
  if (hasImage) messageForAgent += `\n\n[System: User mengirim/mereply gambar. Kamu bisa membuatkan stiker dari gambar ini jika diminta dengan menggunakan tool create_sticker dan isi url dengan "CURRENT_IMAGE"]`

  history.push({ role: 'user', content: messageForAgent })

  const senderInfo: SenderInfo = {
    name: senderName,
    jid: senderJid,
    isGroup,
    groupName: isGroup ? jid : undefined
  }

  try {
    const result = await runAgent(history, senderInfo, usageForAgent)
    const { response, messages } = result

    await sock.sendPresenceUpdate('paused', jid).catch(() => {})

    // 🚀 IMPROVED: Extract and deduplicate matches from both response and tool outputs
    const mediaMap = new Map<string, string[]>() // url -> [type, url]
    const stickerSet = new Set<string>() // url

    const processText = (text: string) => {
      const mm = [...text.matchAll(MEDIA_MARKER_REGEX)]
      for (const m of mm) mediaMap.set(m[2], [m[1], m[2]])
      
      const sm = [...text.matchAll(STICKER_MARKER_REGEX)]
      for (const s of sm) stickerSet.add(s[1])
    }

    processText(response)
    for (const m of messages) {
      if (m.role === 'tool') {
        try {
          const parsed = JSON.parse(m.content)
          if (parsed.media_marker) processText(parsed.media_marker)
        } catch (e) {}
      }
    }

    const mediaMatches = Array.from(mediaMap.values())
    const stickerUrls = Array.from(stickerSet)
    const cleanResponse = response.replace(MEDIA_MARKER_REGEX, '').replace(STICKER_MARKER_REGEX, '').trim()

    history.push(...messages)
    if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY)
    histories.set(senderJid, history)

    // ── Handle Sending ────────────────────────────────────────────────
    
    if (mediaMatches.length > 0 || stickerUrls.length > 0) {
      await sock.sendMessage(jid, { react: { text: '⏳', key: raw.key } }).catch(() => {})
    }

    // 1. Stickers
    if (stickerUrls.length > 0) {
      for (const url of stickerUrls) {
        try {
          let buffer: Buffer
          if (url === 'CURRENT_IMAGE' && hasImage) {
            buffer = await downloadMediaMessage(
              raw.message?.extendedTextMessage?.contextInfo?.quotedMessage ? { message: raw.message!.extendedTextMessage!.contextInfo!.quotedMessage } as any : raw,
              'buffer',
              {}
            ) as Buffer
          } else {
            const res = await fetch(url)
            buffer = Buffer.from(await res.arrayBuffer())
          }

          const sticker = new Sticker(buffer, {
            pack: process.env.BOT_NAME || 'Luath',
            author: process.env.OWNER_NAME || 'Lang',
            type: StickerTypes.FULL,
            quality: 70
          })

          await sock.sendMessage(jid, { sticker: await sticker.toBuffer() }, { quoted: raw })
        } catch (e) {
          console.error('[Bot] AI Sticker failed:', e)
        }
      }
      await sock.sendMessage(jid, { react: { text: '✅', key: raw.key } }).catch(() => {})
    }

    // 2. Media
    if (mediaMatches.length > 0) {
      if (mediaMatches.length === 1) {
        const [type, url] = mediaMatches[0]
        const mediaOptions: any = { caption: cleanResponse }
        if (type === 'image') mediaOptions.image = { url }
        else if (type === 'video') mediaOptions.video = { url }
        else if (type === 'audio') mediaOptions.audio = { url }
        else if (type === 'document') mediaOptions.document = { url }

        await sock.sendMessage(jid, mediaOptions, { quoted: raw }).catch(async () => {
          await sock.sendMessage(jid, { text: cleanResponse }, { quoted: raw }).catch(() => {})
        })
        await sock.sendMessage(jid, { react: { text: '✅', key: raw.key } }).catch(() => {})
      } else {
        if (cleanResponse) await sock.sendMessage(jid, { text: cleanResponse }, { quoted: raw }).catch(() => {})
        await sock.sendMessage(jid, { text: '_Sedang mengunggah beberapa media..._' }, { quoted: raw }).catch(() => null)
        for (const match of mediaMatches) {
          const [, type, url] = match
          const mediaOptions: any = {}
          if (type === 'image') mediaOptions.image = { url }
          else if (type === 'video') mediaOptions.video = { url }
          else if (type === 'audio') mediaOptions.audio = { url }
          else if (type === 'document') mediaOptions.document = { url }
          await sock.sendMessage(jid, mediaOptions, { quoted: raw }).catch(() => {})
          await new Promise(r => setTimeout(r, 1500))
        }
        await sock.sendMessage(jid, { react: { text: '✅', key: raw.key } }).catch(() => {})
      }
    } else if (stickerUrls.length === 0) {
      if (cleanResponse) await sock.sendMessage(jid, { text: cleanResponse }, { quoted: raw }).catch(() => {})
    }

  } catch (err: any) {
    console.error('[Bot] Agent error:', err.message)
    if (err.message.includes('413') || err.message.includes('too large')) {
       histories.set(senderJid, [])
       await sock.sendMessage(jid, { text: '⚠️ Chat history terlalu penuh. Memori chat dibersihkan.' }).catch(() => {})
    } else {
       await sock.sendMessage(jid, { text: '⚠️ Brain is busy. Try again later.' }).catch(() => {})
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseMessage(sock: WASocket, raw: proto.IWebMessageInfo): WAMessage | null {
  const msg = raw.message
  if (!msg) return null
  const text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || msg.videoMessage?.caption || ''
  if (!text) return null
  const jid = raw.key.remoteJid!
  const isGroup = jid.endsWith('@g.us')
  const senderJid = isGroup ? (raw.key.participant ?? raw.participant ?? jid) : jid
  const senderName = raw.pushName ?? 'User'
  const botNumber = (sock.user?.id ?? '').split(':')[0]
  const mentionedJids = msg.extendedTextMessage?.contextInfo?.mentionedJid ?? []
  const mentionedBot = mentionedJids.some(j => j.includes(botNumber))
  const hasPrefix = text.startsWith(process.env.BOT_PREFIX ?? '/')
  return { jid, senderJid, senderName, text, isGroup, mentionedBot, hasPrefix }
}

function detectMediaUrl(text: string): { type: string; url: string } | null {
  for (const [type, pattern] of Object.entries(URL_PATTERNS)) {
    const match = text.match(pattern)
    if (match) return { type, url: match[0] }
  }
  return null
}
