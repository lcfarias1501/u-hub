import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, sep } from 'node:path'
import { shell } from 'electron'
import type { Game, LaunchResult, LibrarySnapshot, NowPlayingGame, PlaytimeLog } from '@shared/types'
import { launch } from './launcher'
import { getValue, onValueChange, setValue } from './storage'
import { parseVdf, vdfGet, type Vdf } from './vdf'

const POLL_MS = 15_000
const RESCAN_MS = 10 * 60_000
/** A gap longer than this between polls (sleep, suspended app) isn't counted as playtime. */
const MAX_TICK_MS = POLL_MS * 2
const KEEP_DAYS = 120

// ── Steam ────────────────────────────────────────────────────────────────────

const NOT_GAMES = /redistributable|steamworks|proton|steam linux runtime|soundtrack|dedicated server|sdk$/i

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => execFile(file, args, { maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => resolve(err ? '' : out)))
}

async function steamRoot(): Promise<string | null> {
  const candidates: string[] = []
  if (process.env.UHUB_STEAM_DIR) candidates.push(process.env.UHUB_STEAM_DIR)
  if (process.platform === 'darwin') candidates.push(join(homedir(), 'Library/Application Support/Steam'))
  if (process.platform === 'linux') candidates.push(join(homedir(), '.local/share/Steam'), join(homedir(), '.steam/steam'))
  if (process.platform === 'win32') {
    const out = await run('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'])
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/)
    if (m) candidates.push(m[1].trim().replace(/\//g, '\\'))
    candidates.push('C:\\Program Files (x86)\\Steam')
  }
  return candidates.find((c) => existsSync(join(c, 'steamapps'))) ?? null
}

const readVdf = (file: string): Vdf | null => {
  try {
    return parseVdf(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function steamLibraries(root: string): string[] {
  const libs = new Set([root])
  const vdf = readVdf(join(root, 'steamapps', 'libraryfolders.vdf'))
  const folders = vdfGet(vdf ?? undefined, 'libraryfolders')
  if (folders && typeof folders === 'object') {
    for (const v of Object.values(folders)) {
      // New format: "0" { "path" "…" }; old format: "1" "…"
      const p = typeof v === 'string' ? v : vdfGet(v, 'path')
      if (typeof p === 'string' && existsSync(p)) libs.add(p)
    }
  }
  return [...libs]
}

/** Steam's own playtime per appid, from the most recently used local account. */
function steamPlaytime(root: string): Map<string, { minutes: number; lastPlayed: number | null }> {
  const out = new Map<string, { minutes: number; lastPlayed: number | null }>()
  const userdata = join(root, 'userdata')
  if (!existsSync(userdata)) return out
  const configs = readdirSync(userdata)
    .map((u) => join(userdata, u, 'config', 'localconfig.vdf'))
    .filter((f) => existsSync(f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  const apps = vdfGet(readVdf(configs[0] ?? '') ?? undefined, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps')
  if (!apps || typeof apps === 'string') return out
  for (const [appid, v] of Object.entries(apps)) {
    const minutes = Number(vdfGet(v, 'Playtime') ?? 0)
    const last = Number(vdfGet(v, 'LastPlayed') ?? 0)
    if (minutes || last) out.set(appid, { minutes, lastPlayed: last ? last * 1000 : null })
  }
  return out
}

async function scanSteam(): Promise<Game[] | null> {
  const root = await steamRoot()
  if (!root) return null
  const playtime = steamPlaytime(root)
  const games: Game[] = []
  for (const lib of steamLibraries(root)) {
    const apps = join(lib, 'steamapps')
    let files: string[] = []
    try {
      files = readdirSync(apps).filter((f) => /^appmanifest_\d+\.acf$/.test(f))
    } catch {
      continue
    }
    for (const f of files) {
      const state = vdfGet(readVdf(join(apps, f)) ?? undefined, 'AppState')
      const appid = vdfGet(state, 'appid')
      const name = vdfGet(state, 'name')
      const dir = vdfGet(state, 'installdir')
      if (typeof appid !== 'string' || typeof name !== 'string' || appid === '228980' || NOT_GAMES.test(name)) continue
      const cdn = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}`
      const pt = playtime.get(appid)
      games.push({
        id: `steam:${appid}`,
        source: 'steam',
        name,
        installDir: typeof dir === 'string' ? join(apps, 'common', dir) : null,
        cover: `${cdn}/library_600x900.jpg`,
        hero: `${cdn}/library_hero.jpg`,
        sourceMinutes: pt?.minutes ?? null,
        sourceLastPlayed: pt?.lastPlayed ?? null
      })
    }
  }
  return games
}

// ── Epic ─────────────────────────────────────────────────────────────────────

interface EpicItem {
  DisplayName?: string
  InstallLocation?: string
  AppName?: string
  CatalogNamespace?: string
  CatalogItemId?: string
  AppCategories?: string[]
  bIsIncompleteInstall?: boolean
}

const epicDir = (): string | null => {
  const dir =
    process.env.UHUB_EPIC_MANIFESTS ??
    (process.platform === 'darwin'
      ? join(homedir(), 'Library/Application Support/Epic/EpicGamesLauncher/Data/Manifests')
      : process.platform === 'win32'
        ? 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests'
        : null)
  return dir && existsSync(dir) ? dir : null
}

const epicLaunch = new Map<string, string>()

function scanEpic(): Game[] | null {
  const dir = epicDir()
  if (!dir) return null
  const games: Game[] = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.item'))) {
    let item: EpicItem
    try {
      item = JSON.parse(readFileSync(join(dir, f), 'utf8')) as EpicItem
    } catch {
      continue
    }
    if (!item.AppName || !item.DisplayName || item.bIsIncompleteInstall) continue
    if (item.AppCategories && !item.AppCategories.includes('games')) continue
    const id = `epic:${item.AppName}`
    epicLaunch.set(
      id,
      `com.epicgames.launcher://apps/${encodeURIComponent(`${item.CatalogNamespace}:${item.CatalogItemId}:${item.AppName}`)}?action=launch&silent=true`
    )
    games.push({
      id,
      source: 'epic',
      name: item.DisplayName,
      installDir: item.InstallLocation ?? null,
      cover: null,
      hero: null,
      sourceMinutes: null,
      sourceLastPlayed: null
    })
  }
  return games
}

// ── Manual ───────────────────────────────────────────────────────────────────

/** For a .app bundle the bundle itself is the "install dir"; for an executable, its folder. */
const manualDir = (path: string): string => (extname(path).toLowerCase() === '.app' ? path : dirname(path))

function manualGames(): Game[] {
  return getValue('manualGames').map((m) => ({
    id: m.id,
    source: 'manual',
    name: m.name,
    installDir: m.path ? manualDir(m.path) : null,
    cover: m.cover,
    hero: m.cover,
    sourceMinutes: null,
    sourceLastPlayed: null
  }))
}

// ── Library state + playtime tracker ─────────────────────────────────────────

let games: Game[] = []
let sources = { steam: false, epic: false }
let scannedAt = 0
let nowPlaying: NowPlayingGame[] = []
let lastPollAt = 0
const listeners = new Set<(s: LibrarySnapshot) => void>()
const nowPlayingListeners = new Set<(playing: NowPlayingGame[]) => void>()

export const snapshot = (): LibrarySnapshot => ({ games, playtime: getValue('playtime'), nowPlaying, scannedAt, sources })
const emit = (): void => listeners.forEach((l) => l(snapshot()))

export function onLibraryChange(l: (s: LibrarySnapshot) => void): void {
  listeners.add(l)
}

/** Fires when the set of running games changes (for Discord status, presence…). */
export function onNowPlayingChange(l: (playing: NowPlayingGame[]) => void): void {
  nowPlayingListeners.add(l)
}

export async function scan(): Promise<LibrarySnapshot> {
  const [steam, epic] = await Promise.all([scanSteam().catch(() => null), Promise.resolve().then(scanEpic).catch(() => null)])
  sources = { steam: steam !== null, epic: epic !== null }
  games = [...(steam ?? []), ...(epic ?? []), ...manualGames()].sort((a, b) => a.name.localeCompare(b.name))
  scannedAt = Date.now()
  emit()
  return snapshot()
}

/** Full paths of running executables. Kept to one cheap process listing per poll. */
async function runningPaths(): Promise<string[]> {
  if (process.platform === 'win32') {
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-Process | Where-Object Path | ForEach-Object Path'])
    return out.split(/\r?\n/).filter(Boolean)
  }
  // macOS `comm` is the full executable path; on Linux use the full command line.
  const out = await run('ps', process.platform === 'darwin' ? ['-axo', 'comm='] : ['-eo', 'args='])
  return out.split('\n').map((l) => l.trim()).filter(Boolean)
}

const dayKey = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// macOS and Windows file systems are case-insensitive by default.
const norm = (p: string): string => (process.platform === 'linux' ? p : p.toLowerCase())

async function poll(): Promise<void> {
  const now = Date.now()
  const elapsed = lastPollAt ? Math.min(now - lastPollAt, MAX_TICK_MS) : 0
  lastPollAt = now

  const running = (await runningPaths()).map(norm)
  const active = games.filter((g) => {
    if (!g.installDir) return false
    const dir = norm(g.installDir)
    return running.some((p) => p === dir || p.startsWith(dir + sep) || p.startsWith(dir + '/'))
  })

  const before = new Set(nowPlaying.map((n) => n.id))
  const log: PlaytimeLog = { ...getValue('playtime') }
  for (const g of active) {
    const entry = log[g.id] ? { ...log[g.id], days: { ...log[g.id].days } } : { totalMs: 0, lastPlayed: now, sessions: 0, days: {} }
    if (!before.has(g.id)) entry.sessions += 1
    else {
      entry.totalMs += elapsed
      const day = dayKey(now)
      entry.days[day] = (entry.days[day] ?? 0) + elapsed
    }
    entry.lastPlayed = now
    // Drop old daily buckets; totals keep everything.
    const cutoff = dayKey(now - KEEP_DAYS * 86_400_000)
    for (const d of Object.keys(entry.days)) if (d < cutoff) delete entry.days[d]
    log[g.id] = entry
  }
  if (active.length) setValue('playtime', log)

  const next = active.map((g) => nowPlaying.find((n) => n.id === g.id) ?? { id: g.id, name: g.name, startedAt: now })
  const changed = next.length !== nowPlaying.length || next.some((n) => !before.has(n.id))
  nowPlaying = next
  if (changed) nowPlayingListeners.forEach((l) => l(nowPlaying))
  if (changed || active.length) emit()
}

export function startLibrary(): void {
  void scan().then(() => poll())
  setInterval(() => void poll().catch(() => undefined), POLL_MS)
  setInterval(() => void scan().catch(() => undefined), RESCAN_MS)
  onValueChange('manualGames', () => void scan())
}

export async function launchGame(id: string): Promise<LaunchResult> {
  const game = games.find((g) => g.id === id)
  if (!game) return { ok: false, error: 'Jogo não encontrado' }
  if (game.source === 'steam') {
    await shell.openExternal(`steam://rungameid/${id.slice('steam:'.length)}`)
    return { ok: true }
  }
  if (game.source === 'epic') {
    const url = epicLaunch.get(id)
    if (!url) return { ok: false, error: 'Link da Epic indisponível' }
    await shell.openExternal(url)
    return { ok: true }
  }
  const manual = getValue('manualGames').find((m) => m.id === id)
  if (!manual) return { ok: false, error: 'Jogo não encontrado' }
  return launch({ id, label: manual.name, kind: 'app', target: manual.path, icon: 'gamepad', accent: 'violet' })
}

export function revealGame(id: string): void {
  const game = games.find((g) => g.id === id)
  if (game?.installDir) shell.showItemInFolder(game.installDir)
}

/** Suggests a name for a picked executable: "Minecraft.app" → "Minecraft". */
export function suggestName(path: string): string {
  return basename(path).replace(/\.(app|exe)$/i, '')
}

