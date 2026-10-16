import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { app, dialog, type BrowserWindow } from 'electron'
import type { BackupSummary, StoreKey, StoreSchema, VaultEntry } from '@shared/types'
import { BACKUP_KEYS, getValue, isPublicKey, readVault, setValue, writeVault } from './storage'

const FORMAT = 'u-hub-backup'

interface SealedVault {
  salt: string
  iv: string
  tag: string
  data: string
}

interface BackupFile {
  format: typeof FORMAT
  version: 1
  appVersion: string
  createdAt: string
  data: Partial<StoreSchema>
  /** Present only when the user chose to include the vault; sealed with their backup password. */
  vault?: SealedVault
}

// The backup password is unrelated to the OS keychain, so the file can be restored on another machine.
const deriveKey = (password: string, salt: Buffer): Buffer => scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })

function seal(entries: VaultEntry[], password: string): SealedVault {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(entries), 'utf8'), cipher.final()])
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

function unseal(v: SealedVault, password: string): VaultEntry[] {
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(password, Buffer.from(v.salt, 'base64')), Buffer.from(v.iv, 'base64'))
  decipher.setAuthTag(Buffer.from(v.tag, 'base64'))
  try {
    const plain = Buffer.concat([decipher.update(Buffer.from(v.data, 'base64')), decipher.final()]).toString('utf8')
    return JSON.parse(plain) as VaultEntry[]
  } catch {
    throw new Error('Senha do backup incorreta')
  }
}

export async function exportBackup(win: BrowserWindow | null, password: string | null): Promise<{ ok: boolean; path?: string }> {
  const date = new Date().toISOString().slice(0, 10)
  const opts = { defaultPath: `u-hub-backup-${date}.json`, filters: [{ name: 'Backup do U-Hub', extensions: ['json'] }] }
  const { canceled, filePath } = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (canceled || !filePath) return { ok: false }

  const data: Partial<StoreSchema> = {}
  for (const key of BACKUP_KEYS) (data as Record<string, unknown>)[key] = getValue(key)
  const file: BackupFile = {
    format: FORMAT,
    version: 1,
    appVersion: app.getVersion(),
    createdAt: new Date().toISOString(),
    data,
    ...(password ? { vault: seal(readVault(), password) } : {})
  }
  await writeFile(filePath, JSON.stringify(file, null, 2), { mode: 0o600 })
  return { ok: true, path: filePath }
}

let pending: { path: string; file: BackupFile } | null = null

/** Step 1: pick and validate a file, returning what it contains so the UI can confirm. */
export async function inspectBackup(win: BrowserWindow | null): Promise<BackupSummary | null> {
  const opts = { properties: ['openFile' as const], filters: [{ name: 'Backup do U-Hub', extensions: ['json'] }] }
  const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (canceled || !filePaths[0]) return null

  let file: BackupFile
  try {
    file = JSON.parse(await readFile(filePaths[0], 'utf8')) as BackupFile
  } catch {
    throw new Error('Arquivo inválido: não é um JSON legível')
  }
  if (file?.format !== FORMAT || typeof file.data !== 'object') throw new Error('Este arquivo não é um backup do U-Hub')

  pending = { path: filePaths[0], file }
  return {
    path: filePaths[0],
    createdAt: file.createdAt,
    appVersion: file.appVersion,
    hasVault: !!file.vault,
    counts: {
      quests: file.data.quests?.length ?? 0,
      launchers: file.data.launchers?.length ?? 0,
      categories: file.data.vaultCategories?.length ?? 0,
      stations: file.data.stations?.length ?? 0
    }
  }
}

/** Step 2: replace current data with the inspected backup. The vault is replaced only if a password is given. */
export function restoreBackup(password: string | null): void {
  if (!pending) throw new Error('Nenhum backup selecionado')
  const { file } = pending
  // Decrypt first so a wrong password aborts before anything is overwritten.
  const vault = file.vault && password ? unseal(file.vault, password) : null
  for (const [key, value] of Object.entries(file.data)) {
    if (isPublicKey(key) && value !== undefined) setValue(key as StoreKey, value as StoreSchema[StoreKey])
  }
  if (vault) writeVault(vault)
  pending = null
}
