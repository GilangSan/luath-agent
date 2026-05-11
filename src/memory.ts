import fs from 'fs/promises'
import path from 'path'

const MEMORY_PATH = path.join(process.cwd(), 'memory.json')

/**
 * Loads the entire memory database from memory.json.
 */
async function loadAllMemory(): Promise<Record<string, string>> {
  try {
    const data = await fs.readFile(MEMORY_PATH, 'utf-8')
    return JSON.parse(data)
  } catch (err) {
    return {}
  }
}

/**
 * Saves the memory database to memory.json.
 */
async function saveAllMemory(data: Record<string, string>): Promise<void> {
  await fs.writeFile(MEMORY_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * Retrieves the specific memory string for a user (by JID).
 */
export async function getUserMemory(jid: string): Promise<string> {
  const all = await loadAllMemory()
  return all[jid] || ''
}

/**
 * Updates or sets the memory string for a user (by JID).
 */
export async function setUserMemory(jid: string, memory: string): Promise<void> {
  const all = await loadAllMemory()
  all[jid] = memory
  await saveAllMemory(all)
}
