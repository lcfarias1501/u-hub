import { createServer, type Server } from 'node:http'
import { createClient, type RealtimeChannel, type Session, type SupabaseClient } from '@supabase/supabase-js'
import { powerMonitor, shell, type BrowserWindow } from 'electron'
import type { Accent, Friend, FriendRequest, FriendRequestResult, Presence, SocialProfile, SocialState } from '@shared/types'
import { onNowPlayingChange, snapshot as librarySnapshot } from './games'
import { notify } from './notifications'
import { onRadioChange, radioState } from './popover'
import { getSettings, getValue, onSettingsChange, readSealedMap, writeSealedMap } from './storage'

const SUPABASE_URL = import.meta.env.MAIN_VITE_SUPABASE_URL?.trim() || null
const KEY = import.meta.env.MAIN_VITE_SUPABASE_ANON_KEY?.trim() || null
const REDIRECT = 'http://127.0.0.1:43822/auth/callback'
const LOGIN_TIMEOUT_MS = 5 * 60_000
const AWAY_AFTER_S = 10 * 60
const PRESENCE_DEBOUNCE_MS = 1500

// ── Client ───────────────────────────────────────────────────────────────────

/** supabase-js storage backed by the sealed (keychain-encrypted) store. */
const storage = {
  getItem: (k: string): string | null => readSealedMap('supabaseAuth')[k] ?? null,
  setItem: (k: string, v: string): void => writeSealedMap('supabaseAuth', { ...readSealedMap('supabaseAuth'), [k]: v }),
  removeItem: (k: string): void => {
    const m = readSealedMap('supabaseAuth')
    delete m[k]
    writeSealedMap('supabaseAuth', m)
  }
}

const client: SupabaseClient | null =
  SUPABASE_URL && KEY
    ? createClient(SUPABASE_URL, KEY, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage },
        realtime: { params: { eventsPerSecond: 5 } }
      })
    : null

// ── State ────────────────────────────────────────────────────────────────────

let state: SocialState = {
  configured: !!client,
  signedIn: false,
  loading: !!client,
  me: null,
  myPresence: null,
  friends: [],
  requests: [],
  error: null
}
let getWin: () => BrowserWindow | null = () => null
let userId: string | null = null
let myChannel: RealtimeChannel | null = null
const friendChannels = new Map<string, RealtimeChannel>()
const presences = new Map<string, Presence | null>()

export const socialState = (): SocialState => state

function set(patch: Partial<SocialState>): void {
  state = { ...state, ...patch }
  getWin()?.webContents.send('social:update', state)
}

interface ProfileRow {
  id: string
  username: string
  display_name: string
  avatar_icon: string
  avatar_accent: string
  discord_avatar: string | null
  friend_code: string
}

const toProfile = (r: ProfileRow): SocialProfile => ({
  id: r.id,
  username: r.username,
  displayName: r.display_name || r.username,
  avatarIcon: r.avatar_icon,
  avatarAccent: r.avatar_accent as Accent,
  discordAvatar: r.discord_avatar,
  friendCode: r.friend_code
})

const PROFILE_COLS = 'id, username, display_name, avatar_icon, avatar_accent, discord_avatar, friend_code'

// ── Lists ────────────────────────────────────────────────────────────────────

async function loadLists(): Promise<void> {
  if (!client || !userId) return
  const me = userId
  const [meRes, fsRes, rqRes] = await Promise.all([
    client.from('profiles').select(PROFILE_COLS).eq('id', me).maybeSingle<ProfileRow>(),
    client.from('friendships').select('user_a, user_b, created_at'),
    client.from('friend_requests').select('id, from_id, to_id, created_at')
  ])
  const err = meRes.error ?? fsRes.error ?? rqRes.error
  if (err) {
    set({ loading: false, error: err.message.includes('does not exist') ? 'O banco ainda não foi configurado (falta rodar o script SQL).' : err.message })
    return
  }

  const friendRows = (fsRes.data ?? []).map((f) => ({ id: f.user_a === me ? f.user_b : f.user_a, since: f.created_at as string }))
  const reqRows = (rqRes.data ?? []).map((r) => ({ id: r.id as string, other: r.from_id === me ? (r.to_id as string) : (r.from_id as string), incoming: r.to_id === me, createdAt: r.created_at as string }))
  const ids = [...new Set([...friendRows.map((f) => f.id), ...reqRows.map((r) => r.other)])]
  const profiles = new Map<string, SocialProfile>()
  if (ids.length) {
    const { data } = await client.from('profiles').select(PROFILE_COLS).in('id', ids)
    for (const p of (data ?? []) as ProfileRow[]) profiles.set(p.id, toProfile(p))
  }

  const friends: Friend[] = friendRows
    .filter((f) => profiles.has(f.id))
    .map((f) => ({ profile: profiles.get(f.id)!, since: f.since, presence: presences.get(f.id) ?? null }))
  const requests: FriendRequest[] = reqRows
    .filter((r) => profiles.has(r.other))
    .map((r) => ({ id: r.id, incoming: r.incoming, profile: profiles.get(r.other)!, createdAt: r.createdAt }))

  set({ loading: false, error: null, me: meRes.data ? toProfile(meRes.data) : null, friends: sortFriends(friends), requests })
  syncFriendChannels(friends.map((f) => f.profile.id))
}

/** Playing first, then online, away, offline; alphabetical within each group. */
function sortFriends(list: Friend[]): Friend[] {
  const rank = (f: Friend): number => (!f.presence ? 3 : f.presence.status === 'playing' ? 0 : f.presence.status === 'online' ? 1 : 2)
  return [...list].sort((a, b) => rank(a) - rank(b) || a.profile.displayName.localeCompare(b.profile.displayName))
}

// ── Presence ─────────────────────────────────────────────────────────────────

function computePresence(): Presence | null {
  const s = getSettings().social
  if (s.invisible) return null
  const now = Date.now()
  const playing = librarySnapshot().nowPlaying[0]
  if (s.shareGame && playing) {
    const game = librarySnapshot().games.find((g) => g.id === playing.id)
    return { status: 'playing', game: { name: playing.name, cover: game?.cover ?? null, since: playing.startedAt }, at: now }
  }
  const away = powerMonitor.getSystemIdleTime() > AWAY_AFTER_S
  const radio = radioState()
  const music = s.shareMusic && radio.playing && radio.station ? { title: radio.station.name, subtitle: radio.station.genre } : undefined
  return { status: away ? 'away' : 'online', music, at: now }
}

let presenceTimer: NodeJS.Timeout | undefined
let lastTracked = ''

/** Re-tracks our presence if it changed (debounced: game/radio/idle changes come in bursts). */
function pushPresence(): void {
  clearTimeout(presenceTimer)
  presenceTimer = setTimeout(async () => {
    if (!myChannel) return
    const p = computePresence()
    // `at` changes every call; compare without it.
    const key = JSON.stringify(p && { ...p, at: 0 })
    if (key === lastTracked) return
    lastTracked = key
    set({ myPresence: p })
    if (p) await myChannel.track(p)
    else await myChannel.untrack()
  }, PRESENCE_DEBOUNCE_MS)
}

function latestMeta(ch: RealtimeChannel): Presence | null {
  // One user may be online from several devices; show the freshest status.
  const metas = Object.values(ch.presenceState<Presence>()).flat()
  return metas.sort((a, b) => b.at - a.at)[0] ?? null
}

function onFriendPresence(friendId: string, ch: RealtimeChannel): void {
  const before = presences.get(friendId) ?? null
  const now = latestMeta(ch)
  presences.set(friendId, now)
  const friend = state.friends.find((f) => f.profile.id === friendId)
  if (friend && now?.status === 'playing' && now.game && before?.game?.name !== now.game.name) {
    notify({ kind: 'social', title: `${friend.profile.displayName} está jogando`, body: now.game.name, image: now.game.cover, view: 'friends' })
  }
  set({ friends: sortFriends(state.friends.map((f) => (f.profile.id === friendId ? { ...f, presence: now } : f))) })
}

/** Joins presence channels for current friends and leaves channels of removed ones. */
function syncFriendChannels(ids: string[]): void {
  if (!client) return
  for (const [id, ch] of friendChannels) {
    if (!ids.includes(id)) {
      void client.removeChannel(ch)
      friendChannels.delete(id)
      presences.delete(id)
    }
  }
  for (const id of ids) {
    if (friendChannels.has(id)) continue
    const ch = client.channel(`presence:${id}`, { config: { private: true } })
    ch.on('presence', { event: 'sync' }, () => onFriendPresence(id, ch)).subscribe()
    friendChannels.set(id, ch)
  }
}

// ── Session lifecycle ────────────────────────────────────────────────────────

async function start(session: Session): Promise<void> {
  if (!client || userId === session.user.id) return
  userId = session.user.id
  set({ signedIn: true, loading: true })
  await client.realtime.setAuth(session.access_token)

  myChannel = client.channel(`presence:${userId}`, { config: { private: true, presence: { key: userId } } })
  myChannel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      lastTracked = ''
      pushPresence()
    }
  })

  // Requests and friendships changing on the server (someone added/accepted/removed us).
  const me = userId
  client
    .channel('uhub-social-db')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: `to_id=eq.${me}` }, async (payload) => {
      await loadLists()
      const req = state.requests.find((r) => r.id === (payload.new as { id: string }).id)
      if (req) notify({ kind: 'social', title: 'Novo pedido de amizade', body: `${req.profile.displayName} (@${req.profile.username}) quer ser seu amigo`, view: 'friends' })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, () => void loadLists())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships' }, async (payload) => {
      const known = new Set(state.friends.map((f) => f.profile.id))
      await loadLists()
      const row = payload.new as { user_a: string; user_b: string }
      const other = row.user_a === me ? row.user_b : row.user_a
      const f = state.friends.find((x) => x.profile.id === other)
      if (f && !known.has(other)) notify({ kind: 'social', title: 'Nova amizade', body: `Agora você e ${f.profile.displayName} são amigos`, view: 'friends' })
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'friendships' }, () => void loadLists())
    .subscribe()

  await loadLists()
  await adoptLocalProfile()
}

async function stop(): Promise<void> {
  if (!client) return
  await client.removeAllChannels()
  friendChannels.clear()
  presences.clear()
  myChannel = null
  userId = null
  lastTracked = ''
  set({ signedIn: false, loading: false, me: null, myPresence: null, friends: [], requests: [] })
}

/** First online sign-in: carry over the avatar/name chosen locally (onboarding or Settings). */
async function adoptLocalProfile(): Promise<void> {
  const local = getValue('profile')
  const me = state.me
  if (!client || !local || !me) return
  const untouched = me.avatarIcon === 'gamepad' && me.avatarAccent === 'violet'
  if (!untouched) return
  await updateProfile({ displayName: local.name || me.displayName, avatarIcon: local.avatar.icon, avatarAccent: local.avatar.accent })
}

// ── Public API ───────────────────────────────────────────────────────────────

let loginServer: Server | null = null

/** Discord OAuth (PKCE) in the browser, landing on a one-shot loopback server. */
export function signIn(): Promise<{ ok: boolean; error?: string }> {
  if (!client) return Promise.resolve({ ok: false, error: 'Este build não tem o servidor de amigos configurado.' })
  loginServer?.close()
  loginServer?.closeAllConnections()

  return new Promise((resolve) => {
    let done = false
    const finish = (r: { ok: boolean; error?: string }): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      server.closeAllConnections()
      loginServer = null
      resolve(r)
    }
    const page = (title: string, body: string): string =>
      `<!doctype html><meta charset="utf-8"><title>U-Hub</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0F0F12;color:#e4e4e7;font:15px ui-monospace,Menlo,monospace"><div style="text-align:center"><div style="color:#8B5CF6;letter-spacing:.3em;font-size:11px">U-HUB // AMIGOS</div><h1 style="font:600 22px system-ui;margin:12px 0">${title}</h1><p style="color:#71717a">${body}</p></div>`

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', REDIRECT)
      if (url.pathname !== '/auth/callback') return void res.writeHead(404).end()
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' })
      const code = url.searchParams.get('code')
      const err = url.searchParams.get('error_description') ?? url.searchParams.get('error')
      if (!code) {
        res.end(page('Login cancelado', 'Você pode fechar esta aba e tentar de novo no U-Hub.'))
        return finish({ ok: false, error: err ?? 'Login cancelado' })
      }
      const { error } = await client.auth.exchangeCodeForSession(code)
      if (error) {
        res.end(page('Falha ao entrar', error.message))
        return finish({ ok: false, error: error.message })
      }
      res.end(page('Pronto! ✓', 'Pode fechar esta aba e voltar para o U-Hub.'))
      finish({ ok: true })
    })
    loginServer = server
    const timer = setTimeout(() => finish({ ok: false, error: 'Tempo de login esgotado' }), LOGIN_TIMEOUT_MS)
    server.once('error', (e: NodeJS.ErrnoException) => finish({ ok: false, error: e.code === 'EADDRINUSE' ? 'Porta 43822 ocupada' : e.message }))
    server.listen(43822, '127.0.0.1', async () => {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: REDIRECT, skipBrowserRedirect: true, scopes: 'identify' }
      })
      if (error || !data.url) return finish({ ok: false, error: error?.message ?? 'Não foi possível iniciar o login' })
      void shell.openExternal(data.url)
    })
  })
}

export async function signOut(): Promise<void> {
  if (!client) return
  await client.auth.signOut({ scope: 'local' })
  await stop()
}

export async function addFriend(target: string): Promise<{ result?: FriendRequestResult; error?: string }> {
  if (!client) return { error: 'Não configurado' }
  const { data, error } = await client.rpc('send_friend_request', { target })
  if (error) return { error: error.message }
  await loadLists()
  return { result: data as FriendRequestResult }
}

export async function respondRequest(id: string, accept: boolean): Promise<{ error?: string }> {
  if (!client) return { error: 'Não configurado' }
  const { error } = await client.rpc('respond_friend_request', { request_id: id, accept })
  await loadLists()
  return error ? { error: error.message } : {}
}

export async function cancelRequest(id: string): Promise<{ error?: string }> {
  if (!client) return { error: 'Não configurado' }
  const { error } = await client.from('friend_requests').delete().eq('id', id)
  await loadLists()
  return error ? { error: error.message } : {}
}

export async function removeFriend(friendId: string): Promise<{ error?: string }> {
  if (!client || !userId) return { error: 'Não configurado' }
  const [a, b] = [userId, friendId].sort()
  const { error } = await client.from('friendships').delete().eq('user_a', a).eq('user_b', b)
  await loadLists()
  return error ? { error: error.message } : {}
}

export async function updateProfile(patch: { username?: string; displayName?: string; avatarIcon?: string; avatarAccent?: Accent }): Promise<{ error?: string }> {
  if (!client || !userId) return { error: 'Não conectado' }
  const row: Record<string, string> = { updated_at: new Date().toISOString() }
  if (patch.username !== undefined) {
    const u = patch.username.trim().toLowerCase()
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return { error: 'Use 3 a 20 caracteres: letras minúsculas, números ou _' }
    row.username = u
  }
  if (patch.displayName !== undefined) row.display_name = patch.displayName.trim().slice(0, 32)
  if (patch.avatarIcon !== undefined) row.avatar_icon = patch.avatarIcon
  if (patch.avatarAccent !== undefined) row.avatar_accent = patch.avatarAccent
  const { error } = await client.from('profiles').update(row).eq('id', userId)
  if (error) return { error: error.code === '23505' ? 'Esse nome de usuário já está em uso' : error.message }
  await loadLists()
  return {}
}

export function startSocial(win: () => BrowserWindow | null): void {
  getWin = win
  if (!client) return

  client.auth.onAuthStateChange((event, session) => {
    // Defer: supabase-js warns against awaiting other client calls inside this callback.
    setTimeout(() => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) {
        if (event === 'TOKEN_REFRESHED') void client.realtime.setAuth(session.access_token)
        void start(session)
      } else if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
        void stop()
      }
    }, 0)
  })

  // Things that change what we broadcast.
  onNowPlayingChange(() => pushPresence())
  onRadioChange(() => pushPresence())
  onSettingsChange(() => pushPresence())
  setInterval(() => pushPresence(), 60_000) // idle → away
  powerMonitor.on('resume', () => pushPresence())
}

export async function stopSocial(): Promise<void> {
  // Leave presence promptly so friends see us go offline right away.
  await myChannel?.untrack().catch(() => undefined)
}
