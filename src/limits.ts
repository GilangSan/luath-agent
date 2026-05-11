import fs from 'fs/promises'
import path from 'path'

const LIMITS_PATH = path.join(process.cwd(), 'limits.json')

interface UsageData {
  count: number
  date: string
}

/**
 * Loads all user usage data from limits.json.
 */
async function loadAllUsage(): Promise<Record<string, UsageData>> {
  try {
    const data = await fs.readFile(LIMITS_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (err) {
    return {}
  }
}

/**
 * Saves all user usage data to limits.json.
 */
async function saveAllUsage(data: Record<string, UsageData>): Promise<void> {
  await fs.writeFile(LIMITS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Gets the current usage for a specific user.
 * Resets if the date has changed.
 */
export async function getUsage(jid: string): Promise<UsageData> {
  const all = await loadAllUsage()
  const today = new Date().toISOString().split('T')[0]
  
  const usage = all[jid]
  if (!usage || usage.date !== today) {
    return { count: 0, date: today }
  }
  
  return usage
}

/**
 * Increments and saves the usage for a specific user.
 */
export async function incrementUsage(jid: string): Promise<number> {
  const all = await loadAllUsage()
  const today = new Date().toISOString().split('T')[0]
  
  let usage = all[jid]
  if (!usage || usage.date !== today) {
    usage = { count: 0, date: today }
  }
  
  usage.count++
  all[jid] = usage
  await saveAllUsage(all)
  
  return usage.count
}
