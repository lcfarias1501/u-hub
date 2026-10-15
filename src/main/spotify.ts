import { execFile, spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { hostname } from 'node:os'
import { shell } from 'electron'
import {
  SPOTIFY_REDIRECT_URI,
  type SpotifyCommand,
  type SpotifyDevice,
  type SpotifyPlayback,
  type SpotifyPlaylistItem,
  type SpotifyResult,
  type SpotifyStatus
} from '@shared/types'
import {
  getCustomSpotifyClientId,
  getSpotifyClientId,
  hasBuiltInSpotifyClientId,
  readSpotifyAuth,
  setSpotifyClientId,
  writeSpotifyAuth
} from './storage'

const SCOPES = [
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative'
]
const LOGIN_TIMEOUT_MS = 5 * 60_000
const API = 'https://api.spotify.com/v1'

interface Auth {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

class SpotifyError extends Error {
  constructor(
    message: string,
    readonly reason?: string
  ) {
    super(message)
  }
}

// ── OAuth (Authorization Code + PKCE) ────────────────────────────────────────

const b64url = (buf: Buffer): string => buf.toString('base64url')

let pendingLogin: Server | null = null

async function exchange(params: Record<string, string>): Promise<Auth> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params)
  })
  const json = (await res.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error_description?: string
    error?: string
  }
  if (!res.ok || !json.access_token) {
    throw new SpotifyError(json.error_description ?? json.error ?? `Token HTTP ${res.status}`, json.error)
  }
  return {
    accessToken: json.access_token,
    // Refresh responses may omit refresh_token; keep the previous one in that case.
    refreshToken: json.refresh_token ?? params.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000
  }
}

const page = (title: string, body: string): string => `<!doctype html><meta charset="utf-8"><title>U-Hub</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#0F0F12;color:#e4e4e7;font:15px ui-monospace,Menlo,monospace">
<div style="text-align:center"><div style="color:#8B5CF6;letter-spacing:.3em;font-size:11px">U-HUB // SPOTIFY</div>
<h1 style="font:600 22px system-ui;margin:12px 0">${title}</h1><p style="color:#71717a">${body}</p></div>`

/**
 * Opens the Spotify consent page in the system browser and waits for the redirect
 * on a one-shot loopback server. Resolves once tokens are stored.
 */
export function login(): Promise<SpotifyResult> {
  const clientId = getSpotifyClientId()
  if (!clientId) return Promise.resolve({ ok: false, error: 'Configure o Client ID primeiro' })

  pendingLogin?.close()
  pendingLogin?.closeAllConnections()
  const verifier = b64url(randomBytes(64))
  const challenge = b64url(createHash('sha256').update(verifier).digest())
  const state = b64url(randomBytes(16))
  const redirect = new URL(SPOTIFY_REDIRECT_URI)

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: SpotifyResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Drop keep-alive sockets too, or a retry from the browser could hit this stale server.
      server.close()
      server.closeAllConnections()
      pendingLogin = null
      resolve(result)
    }

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', SPOTIFY_REDIRECT_URI)
      if (url.pathname !== redirect.pathname) {
        res.writeHead(404).end()
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' })
      if (error || !code || url.searchParams.get('state') !== state) {
        res.end(page('Conexão cancelada', 'Você pode fechar esta aba e tentar de novo no U-Hub.'))
        finish({ ok: false, error: error === 'access_denied' ? 'Acesso negado no Spotify' : 'Resposta de login inválida' })
        return
      }
      try {
        writeSpotifyAuth(
          await exchange({
            grant_type: 'authorization_code',
            code,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            client_id: clientId,
            code_verifier: verifier
          })
        )
        res.end(page('Spotify conectado ✓', 'Pode fechar esta aba e voltar para o U-Hub.'))
        finish({ ok: true, data: undefined })
      } catch (err) {
        res.end(page('Falha ao conectar', (err as Error).message))
        finish({ ok: false, error: (err as Error).message })
      }
    })
    pendingLogin = server

    const timer = setTimeout(() => finish({ ok: false, error: 'Tempo de login esgotado' }), LOGIN_TIMEOUT_MS)

    server.once('error', (err: NodeJS.ErrnoException) =>
      finish({ ok: false, error: err.code === 'EADDRINUSE' ? `Porta ${redirect.port} ocupada` : err.message })
    )
    server.listen(Number(redirect.port), redirect.hostname, () => {
      const auth = new URL('https://accounts.spotify.com/authorize')
      auth.search = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: SPOTIFY_REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state,
        scope: SCOPES.join(' ')
      }).toString()
      void shell.openExternal(auth.toString())
    })
  })
}

export function logout(): void {
  writeSpotifyAuth(null)
}

/** Empty string clears the override and falls back to the built-in Client ID. */
export function setClientId(id: string): void {
  const before = getSpotifyClientId()
  setSpotifyClientId(id.trim() || null)
  if (getSpotifyClientId() !== before) logout() // tokens belong to the old app
}

let refreshing: Promise<Auth> | null = null

async function accessToken(): Promise<string> {
  const auth = readSpotifyAuth<Auth>()
  const clientId = getSpotifyClientId()
  if (!auth || !clientId) throw new SpotifyError('Spotify não conectado', 'NOT_CONNECTED')
  if (auth.expiresAt - 60_000 > Date.now()) return auth.accessToken

  // Concurrent calls share one refresh; Spotify may rotate the refresh token.
  refreshing ??= exchange({ grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: clientId })
    .then((next) => {
      writeSpotifyAuth(next)
      return next
    })
    .catch((err) => {
      if (err instanceof SpotifyError && err.reason === 'invalid_grant') logout()
      throw err
    })
    .finally(() => {
      refreshing = null
    })
  return (await refreshing).accessToken
}

// ── Web API ──────────────────────────────────────────────────────────────────

async function api<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  const token = await accessToken()
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  if (res.status === 204) return null
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    const e = json?.error
    throw new SpotifyError(e?.message ?? `HTTP ${res.status}`, e?.reason ?? (res.status === 401 ? 'NOT_CONNECTED' : undefined))
  }
  return json as T
}

async function wrap<T>(fn: () => Promise<T>): Promise<SpotifyResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    const e = err as SpotifyError
    return { ok: false, error: e.message, reason: e.reason }
  }
}

type Image = { url: string; width: number | null }
// Spotify returns images largest-first; the smallest one ≥ 64px is enough for thumbnails.
const pickImage = (imgs: Image[] | null | undefined, min = 64): string | null =>
  imgs?.length ? ([...imgs].reverse().find((i) => (i.width ?? 0) >= min) ?? imgs[0]).url : null

interface RawDevice {
  id: string
  name: string
  type: string
  is_active: boolean
  volume_percent: number | null
}
const toDevice = (d: RawDevice): SpotifyDevice => ({
  id: d.id,
  name: d.name,
  type: d.type,
  isActive: d.is_active,
  volume: d.volume_percent
})

export async function status(): Promise<SpotifyStatus> {
  const clientId = getSpotifyClientId()
  const base = { clientId, hasBuiltInClientId: hasBuiltInSpotifyClientId(), usingCustomClientId: getCustomSpotifyClientId() != null }
  if (!clientId || !readSpotifyAuth<Auth>()) return { ...base, connected: false, user: null }
  const me = await wrap(() =>
    api<{ display_name: string | null; id: string; product?: string; images?: Image[] }>('GET', '/me')
  )
  // A network hiccup keeps the session; only an auth failure means "disconnected".
  if (!me.ok) return { ...base, connected: me.reason !== 'NOT_CONNECTED' && me.reason !== 'invalid_grant', user: null }
  if (!me.data) return { ...base, connected: true, user: null }
  return {
    ...base,
    connected: true,
    user: { name: me.data.display_name ?? me.data.id, product: me.data.product ?? 'unknown', avatar: pickImage(me.data.images, 32) }
  }
}

export function playback(): Promise<SpotifyResult<SpotifyPlayback | null>> {
  return wrap(async () => {
    const p = await api<{
      is_playing: boolean
      progress_ms: number | null
      shuffle_state: boolean
      repeat_state: 'off' | 'context' | 'track'
      device: RawDevice
      context: { uri: string } | null
      item: {
        name: string
        uri: string
        duration_ms: number
        artists?: { name: string }[]
        album?: { name: string; images: Image[] }
        show?: { name: string; images: Image[] }
      } | null
    }>('GET', '/me/player?additional_types=episode')
    if (!p) return null
    const art = p.item?.album ?? p.item?.show
    return {
      isPlaying: p.is_playing,
      progressMs: p.progress_ms ?? 0,
      durationMs: p.item?.duration_ms ?? 0,
      shuffle: p.shuffle_state,
      repeat: p.repeat_state,
      track: p.item
        ? {
            name: p.item.name,
            uri: p.item.uri,
            artists: p.item.artists?.map((a) => a.name).join(', ') ?? p.item.show?.name ?? '',
            album: art?.name ?? '',
            image: pickImage(art?.images, 300)
          }
        : null,
      device: p.device ? toDevice(p.device) : null,
      contextUri: p.context?.uri ?? null,
      fetchedAt: Date.now()
    }
  })
}

export function devices(): Promise<SpotifyResult<SpotifyDevice[]>> {
  return wrap(async () => (await api<{ devices: RawDevice[] }>('GET', '/me/player/devices'))?.devices.map(toDevice) ?? [])
}

export function playlists(): Promise<SpotifyResult<SpotifyPlaylistItem[]>> {
  return wrap(async () => {
    const res = await api<{
      items: ({ uri: string; name: string; images: Image[] | null; tracks?: { total: number }; owner: { display_name: string } } | null)[]
    }>('GET', '/me/playlists?limit=50')
    return (res?.items ?? [])
      .filter((p) => p != null)
      .map((p) => ({ uri: p.uri, name: p.name, image: pickImage(p.images), tracks: p.tracks?.total ?? 0, owner: p.owner.display_name }))
  })
}

export function command(cmd: SpotifyCommand): Promise<SpotifyResult> {
  return wrap(async () => {
    switch (cmd.type) {
      case 'play': {
        const q = cmd.deviceId ? `?device_id=${encodeURIComponent(cmd.deviceId)}` : ''
        await api('PUT', `/me/player/play${q}`, cmd.contextUri ? { context_uri: cmd.contextUri } : undefined)
        break
      }
      case 'pause':
        await api('PUT', '/me/player/pause')
        break
      case 'next':
        await api('POST', '/me/player/next')
        break
      case 'previous':
        await api('POST', '/me/player/previous')
        break
      case 'seek':
        await api('PUT', `/me/player/seek?position_ms=${Math.max(0, Math.round(cmd.positionMs))}`)
        break
      case 'volume':
        await api('PUT', `/me/player/volume?volume_percent=${Math.min(100, Math.max(0, Math.round(cmd.percent)))}`)
        break
      case 'shuffle':
        await api('PUT', `/me/player/shuffle?state=${cmd.state}`)
        break
      case 'repeat':
        await api('PUT', `/me/player/repeat?state=${cmd.state}`)
        break
      case 'transfer':
        await api('PUT', '/me/player', { device_ids: [cmd.deviceId], play: true })
        break
    }
  })
}

// ── Play on this computer ────────────────────────────────────────────────────

const norm = (s: string): string => s.toLowerCase().replace(/\.local$/, '').replace(/[^a-z0-9]/g, '')

function openSpotifyApp(): void {
  if (process.platform === 'darwin') execFile('open', ['-g', '-a', 'Spotify'], () => undefined)
  else if (process.platform === 'win32') void shell.openExternal('spotify:')
  else spawn('spotify', [], { detached: true, stdio: 'ignore' }).on('error', () => undefined).unref()
}

/**
 * Opens the Spotify desktop app (in the background) and moves playback to it.
 * The app needs a few seconds to register as a Connect device, so devices are polled.
 */
export function playHere(): Promise<SpotifyResult<string>> {
  return wrap(async () => {
    const me = norm(hostname())
    const find = async (): Promise<SpotifyDevice | undefined> => {
      const list = (await api<{ devices: RawDevice[] }>('GET', '/me/player/devices'))?.devices.map(toDevice) ?? []
      const computers = list.filter((d) => d.type === 'Computer')
      return computers.find((d) => norm(d.name) === me) ?? (computers.length === 1 ? computers[0] : undefined)
    }

    let device = await find()
    if (!device) {
      openSpotifyApp()
      for (let i = 0; i < 12 && !device; i++) {
        await new Promise((r) => setTimeout(r, 1000))
        device = await find()
      }
    }
    if (!device) {
      throw new SpotifyError('O Spotify abriu, mas ainda não apareceu como dispositivo. Dê play uma vez no app e tente de novo.', 'NO_LOCAL_DEVICE')
    }
    await api('PUT', '/me/player', { device_ids: [device.id], play: true })
    return device.name
  })
}
