import 'dotenv/config'
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys'
import pino from 'pino'
import { handleMessage } from './bot.js'

const logger = pino({ level: 'silent' })
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

let isPairing = false
let retryCount = 0

/**
 * Main function to initialize and start the WhatsApp Bot
 */
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()
  
  // 🛠️ Optimization: Using a more stable browser identifier
  // and adjusting timeouts to prevent 428 errors.
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    // Using MacOS/Chrome/121 style to appear more like a stable desktop session
    browser: ['Mac OS', 'Chrome', '121.0.6167.85'], 
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 30_000, // Do NOT set to 0, it can cause hangs
    keepAliveIntervalMs: 30_000,
    generateHighQualityLinkPreview: true,
    markOnlineOnConnect: true, // Helps keep connection active
    // Patch for frequent disconnects: aggressive retry for some codes
    retryRequestDelayMs: 2000,
  })

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      
      if (isPairing) {
        console.log(`⏳ Connection lost during pairing (status: ${statusCode}), reconnecting...`)
        isPairing = false
        await delay(5000)
        startBot()
        return
      }

      console.log(`⚠️ Connection closed (status: ${statusCode}), reconnecting: ${shouldReconnect}`)

      if (shouldReconnect) {
        retryCount++
        // Exponential backoff for reconnection to avoid spamming WhatsApp servers
        const waitTime = Math.min(retryCount * 5000, 30000)
        console.log(`🔄 Retrying in ${waitTime/1000}s... (Attempt ${retryCount})`)
        await delay(waitTime)
        startBot()
      } else {
        console.log('门 Logged out — please delete the auth_info folder and restart to re-pair')
      }
    } else if (connection === 'open') {
      isPairing = false
      retryCount = 0 // Reset on success
      const botName = process.env.BOT_NAME ?? 'Luath'
      console.log(`\n✅ Bot "${botName}" successfully connected!`)
      console.log(`🤖 Model: ${process.env.GROQ_MODEL ?? process.env.OPENROUTER_MODEL}`)
      console.log(`📝 Prefix: ${process.env.BOT_PREFIX ?? '/'}`)
      console.log(`💬 Max history: ${process.env.MAX_HISTORY ?? '25'} messages\n`)
    }
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue
      try {
        await handleMessage(sock, msg)
      } catch (err: any) {
        console.error('[Socket] Error in message handler:', err.message)
      }
    }
  })

  if (!sock.authState.creds.registered) {
    const phoneNumber = process.env.BOT_NUMBER
    if (!phoneNumber) throw new Error('BOT_NUMBER not found in .env')
    isPairing = true
    await delay(7000)
    try {
      const code = await sock.requestPairingCode(phoneNumber)
      const formatted = code.match(/.{1,4}/g)?.join('-') ?? code
      console.log('\n┌─────────────────────────────────────────┐')
      console.log(`│  📱 Pairing Code: ${formatted.padEnd(22)}│`)
      console.log('├─────────────────────────────────────────┤')
      console.log('│  Enter this in WhatsApp Linked Devices  │')
      console.log('└─────────────────────────────────────────┘\n')
    } catch (err) {
      isPairing = false
      console.error('⚠️ Failed to request pairing code:', (err as Error).message)
      await delay(10_000)
      startBot()
    }
  }
}

console.log('🚀 Starting WhatsApp AI Agent...\n')
startBot().catch(err => {
  console.error('❌ Fatal error during startup:', err)
  process.exit(1)
})
