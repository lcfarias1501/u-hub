import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import type { DiscordSettings, DiscordStatus, NowPlayingGame, RadioState } from '@shared/types'
import { onNowPlayingChange, snapshot as librarySnapshot } from './games'
import { onRadioChange, radioState } from './popover'
import { getSettings, onSettingsChange } from './storage'

/**
 * Discord Rich Presence over Discord's local IPC (no OAuth, no network):
 * a unix socket / named pipe `discord-ipc-N` speaking framed JSON —
 * [opcode int32 LE][length int32 LE][utf-8 JSON].
 */
const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 } as const
const RETRY_MS = 20_000
/** Discord allows ~5 SET_ACTIVITY per 20s; coalesce bursts of changes. */
const SEND_DEBOUNCE_MS = 1500
const LOGO = 'https://raw.githubusercontent.com/lcfarias1501/u-hub/main/resources/icon.png'
const DOWNLOAD_URL = 'https://github.com/lcfarias1501/u-hub/releases/latest'
const BUILT_IN_CLIENT_ID = import.meta.env.MAIN_VITE_DISCORD_CLIENT_ID?.trim() || null

interface Activity {
  type?: number
  details: string
  state?: string
  timestamps?: { start: number }
  assets?: { large_image?: string; large_text?: string; small_image?: string; small_text?: string }
  buttons?: { label: string; url: string }[]
}

let socket: Socket | null = null
let ready = false
let connecting = false
let user: string | null = null
let retryTimer: NodeJS.Timeout | undefined
let sendTimer: NodeJS.Timeout | undefined
let lastSent = ''
let activity: Activity | null = null
let radioSince: number | null = null
let getWin: () => BrowserWindow | null = () => null

const clientId = (s: DiscordSettings = getSettings().discord): string | null => s.clientId?.trim() || BUILT_IN_CLIENT_ID

function ipcPaths(): string[] {
  if (process.platform === 'win32') return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`)
  const base = process.env.UHUB_DISCORD_IPC_DIR ?? process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? '/tmp'
  // Flatpak and Snap builds of Discord put the socket in a subfolder.
  const dirs = [base, join(base, 'app/com.discordapp.Discord'), join(base, 'snap.discord'), '/tmp']
  return dirs.flatMap((d) => Array.from({ length: 10 }, (_, i) => join(d, `discord-ipc-${i}`))).filter((p) => existsSync(p))
}

function encode(op: number, payload: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.alloc(8)
  header.writeInt32LE(op, 0)
  header.writeInt32LE(json.length, 4)
  return Buffer.concat([header, json])
}

export function discordStatus(): DiscordStatus {
  const s = getSettings().discord
  const state = !s.enabled ? 'off' : !clientId(s) ? 'no-client-id' : ready ? 'connected' : connecting ? 'connecting' : 'not-running'
  return {
    state,
    user: ready ? user : null,
    activity: ready && activity ? { type: activity.type ?? 0, details: activity.details, state: activity.state } : null,
    hasBuiltInClientId: !!BUILT_IN_CLIENT_ID
  }
}

const emitStatus = (): void => getWin()?.webContents.send('discord:status', discordStatus())

function teardown(): void {
  socket?.removeAllListeners()
  socket?.destroy()
  socket = null
  ready = false
  connecting = false
  lastSent = ''
  emitStatus()
}

function scheduleRetry(): void {
  clearTimeout(retryTimer)
  retryTimer = setTimeout(() => void connectDiscord(), RETRY_MS)
}

/** Tries each candidate socket until one answers the handshake. */
async function connectDiscord(): Promise<void> {
  const s = getSettings().discord
  const id = clientId(s)
  if (!s.enabled || !id || ready || connecting) return
  connecting = true
  emitStatus()

  for (const path of ipcPaths()) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = connect(path)
      let buf = Buffer.alloc(0)
      const fail = (): void => {
        sock.destroy()
        resolve(false)
      }
      sock.once('error', fail)
      sock.once('connect', () => sock.write(encode(OP.HANDSHAKE, { v: 1, client_id: id })))
      sock.on('data', (chunk: Buffer) => {
        buf = Buffer.concat([buf, chunk])
        while (buf.length >= 8) {
          const op = buf.readInt32LE(0)
          const len = buf.readInt32LE(4)
          if (buf.length < 8 + len) break
          const msg = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'))
          buf = buf.subarray(8 + len)
          if (op === OP.PING) sock.write(encode(OP.PONG, msg))
          else if (op === OP.CLOSE) {
            // Wrong client id or Discord shutting down.
            fail()
          } else if (msg.evt === 'READY' && !ready) {
            socket = sock
            ready = true
            user = msg.data?.user?.global_name ?? msg.data?.user?.username ?? null
            sock.removeListener('error', fail)
            sock.on('error', () => undefined)
            sock.on('close', () => {
              teardown()
              scheduleRetry()
            })
            resolve(true)
          }
        }
      })
      setTimeout(() => !ready && fail(), 3000)
    })
    if (ok) break
  }

  connecting = false
  if (ready) {
    emitStatus()
    update(true)
  } else {
    emitStatus()
    scheduleRetry()
  }
}

// ── What to show ─────────────────────────────────────────────────────────────

function fmtTotal(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  return h >= 1 ? `${h}h no total` : `${Math.max(1, Math.round(ms / 60_000))}min no total`
}

function computeActivity(): Activity | null {
  const s = getSettings().discord
  const buttons = s.showButton ? [{ label: 'Baixar U-Hub', url: DOWNLOAD_URL }] : undefined
  const lib = librarySnapshot()
  const playing: NowPlayingGame | undefined = lib.nowPlaying[0]

  if (s.showGames && playing) {
    const game = lib.games.find((g) => g.id === playing.id)
    const total = Math.max(lib.playtime[playing.id]?.totalMs ?? 0, (game?.sourceMinutes ?? 0) * 60_000)
    return {
      type: 0,
      details: playing.name,
      state: total > 0 ? fmtTotal(total) : 'via U-Hub',
      timestamps: { start: playing.startedAt },
      assets: { large_image: game?.cover ?? LOGO, large_text: playing.name, small_image: LOGO, small_text: 'U-Hub' },
      buttons
    }
  }

  const radio: RadioState = radioState()
  if (s.showRadio && radio.playing && radio.station) {
    return {
      type: 2, // "Listening to"
      details: radio.station.name,
      state: radio.station.genre,
      timestamps: radioSince ? { start: radioSince } : undefined,
      assets: { large_image: LOGO, large_text: 'U-Hub Radio' },
      buttons
    }
  }

  if (s.showIdle) return { type: 0, details: 'No U-Hub', state: 'Command center', assets: { large_image: LOGO, large_text: 'U-Hub' }, buttons }
  return null
}

/** Recomputes the activity and sends it if it changed (debounced to respect Discord's rate limit). */
function update(immediate = false): void {
  activity = computeActivity()
  const send = (): void => {
    if (!ready || !socket) return
    const key = JSON.stringify(activity)
    if (key === lastSent) return
    lastSent = key
    socket.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: randomUUID() }))
    emitStatus()
  }
  clearTimeout(sendTimer)
  if (immediate) send()
  else sendTimer = setTimeout(send, SEND_DEBOUNCE_MS)
}

export function startDiscord(win: () => BrowserWindow | null): void {
  getWin = win
  onNowPlayingChange(() => update())
  onRadioChange((r) => {
    const wasPlaying = radioSince !== null
    if (r.playing && !wasPlaying) radioSince = Date.now()
    if (!r.playing) radioSince = null
    update()
  })

  let prev = JSON.stringify(getSettings().discord)
  onSettingsChange((s) => {
    const next = JSON.stringify(s.discord)
    if (next === prev) return
    const old = JSON.parse(prev) as DiscordSettings
    prev = next
    // A different app id (or turning it off) needs a fresh handshake.
    if (!s.discord.enabled || clientId(old) !== clientId(s.discord)) teardown()
    if (s.discord.enabled) void connectDiscord()
    update(true)
    emitStatus()
  })

  void connectDiscord()
}

export function stopDiscord(): void {
  if (ready && socket) socket.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: randomUUID() }))
  teardown()
}
