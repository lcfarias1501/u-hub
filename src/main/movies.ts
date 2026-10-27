import { app } from 'electron'
import type {
  CastMember,
  DiscoverQuery,
  Episode,
  Genre,
  MediaType,
  MoviesHome,
  MoviesStatus,
  SeasonSummary,
  TitleDetails,
  TitlePage,
  TitleSummary,
  TitleVideo,
  WatchProvider
} from '@shared/types'
import { notify } from './notifications'
import { getPrivate, getSettings, getValue, setPrivate } from './storage'

/**
 * Filmes & Séries, backed by The Movie Database (TMDB). The read-only API token
 * is baked into the build (MAIN_VITE_TMDB_TOKEN). "Where to watch" data comes from
 * JustWatch through TMDB, per region.
 */
const TOKEN = import.meta.env.MAIN_VITE_TMDB_TOKEN?.trim() || null
const API = 'https://api.themoviedb.org/3'
const IMG = 'https://image.tmdb.org/t/p'
const HOUR = 3_600_000
const ALERT_EVERY_MS = 12 * HOUR
const ALERT_FIRST_DELAY_MS = 90_000
const MAX_ALERT_CHECKS = 40

/** The store region the user picked (Settings → Geral), else the OS region. */
export const region = (): string => {
  const chosen = getSettings().storeCountry
  return (chosen && chosen !== 'auto' ? chosen : app.getLocaleCountryCode() || 'BR').toUpperCase()
}
const language = (): string => (region() === 'PT' ? 'pt-PT' : 'pt-BR')

export const moviesStatus = (): MoviesStatus => ({ configured: !!TOKEN, region: region() })

// ── HTTP + cache ─────────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; data: unknown }>()

async function tmdb<T>(path: string, params: Record<string, string | number | undefined> = {}, ttl = HOUR): Promise<T> {
  if (!TOKEN) throw new Error('Filmes & Séries não está configurado nesta versão (falta o token do TMDB).')
  const url = new URL(API + path)
  for (const [k, v] of Object.entries({ language: language(), ...params })) if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  const key = url.toString()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.data as T
  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) })
  } catch (e) {
    throw new Error((e as Error).name === 'TimeoutError' ? 'O TMDB demorou demais para responder.' : 'Sem conexão com o TMDB. Confira sua internet.')
  }
  if (!res.ok) throw new Error(res.status === 401 ? 'Token do TMDB inválido.' : res.status === 404 ? 'Título não encontrado.' : `TMDB respondeu ${res.status}`)
  const data = (await res.json()) as T
  cache.set(key, { at: Date.now(), data })
  if (cache.size > 400) cache.delete(cache.keys().next().value!)
  return data
}

const img = (path: string | null | undefined, size: string): string | null => (path ? `${IMG}/${size}${path}` : null)

// ── Mapping ──────────────────────────────────────────────────────────────────

interface RawTitle {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
  vote_average?: number
  vote_count?: number
  overview?: string
  genre_ids?: number[]
}

function summary(r: RawTitle, type?: MediaType): TitleSummary | null {
  const t = (type ?? r.media_type) as MediaType
  if (t !== 'movie' && t !== 'tv') return null // search/multi also returns people
  const date = r.release_date || r.first_air_date
  return {
    id: r.id,
    type: t,
    title: r.title ?? r.name ?? '',
    originalTitle: r.original_title ?? r.original_name ?? '',
    year: date ? Number(date.slice(0, 4)) : null,
    poster: img(r.poster_path, 'w342'),
    backdrop: img(r.backdrop_path, 'w1280'),
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    votes: r.vote_count ?? 0,
    overview: r.overview ?? '',
    genreIds: r.genre_ids ?? []
  }
}

const summaries = (list: RawTitle[] | undefined, type?: MediaType): TitleSummary[] =>
  (list ?? []).map((r) => summary(r, type)).filter((x): x is TitleSummary => !!x && !!x.poster)

interface RawPage {
  page: number
  total_pages: number
  total_results: number
  results: RawTitle[]
}

const page = (p: RawPage, type?: MediaType): TitlePage => ({
  items: summaries(p.results, type),
  page: p.page,
  // TMDB refuses pages past 500.
  totalPages: Math.min(p.total_pages, 500),
  totalResults: p.total_results
})

// ── Lists ────────────────────────────────────────────────────────────────────

export async function genres(type: MediaType): Promise<Genre[]> {
  return (await tmdb<{ genres: Genre[] }>(`/genre/${type}/list`, {}, 24 * HOUR)).genres
}

/** Streaming services available in the region, most popular first. */
export async function providers(): Promise<WatchProvider[]> {
  const r = region()
  const data = await tmdb<{ results: { provider_id: number; provider_name: string; logo_path: string | null; display_priorities?: Record<string, number> }[] }>(
    '/watch/providers/movie',
    { watch_region: r },
    24 * HOUR
  )
  return data.results
    .sort((a, b) => (a.display_priorities?.[r] ?? 999) - (b.display_priorities?.[r] ?? 999))
    .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: img(p.logo_path, 'w92') }))
}

export async function discover(q: DiscoverQuery): Promise<TitlePage> {
  const movie = q.type === 'movie'
  const dateField = movie ? 'primary_release_date' : 'first_air_date'
  const sort = q.sort === 'rating' ? 'vote_average.desc' : q.sort === 'recent' ? `${dateField}.desc` : 'popularity.desc'
  const data = await tmdb<RawPage>(`/discover/${q.type}`, {
    page: q.page,
    sort_by: sort,
    // Top-rated by a handful of votes is noise; recent titles still need some audience.
    'vote_count.gte': q.sort === 'rating' ? 300 : q.sort === 'recent' ? 20 : undefined,
    with_genres: q.genres.join(',') || undefined,
    'with_runtime.gte': q.runtimeMin ?? undefined,
    'with_runtime.lte': q.runtimeMax ?? undefined,
    with_watch_providers: q.providers.join('|') || undefined,
    watch_region: region(),
    with_watch_monetization_types: q.providers.length ? 'flatrate|free|ads' : undefined,
    [`${dateField}.gte`]: q.yearFrom ? `${q.yearFrom}-01-01` : undefined,
    // "Recent" shouldn't list announced titles that aren't out yet.
    [`${dateField}.lte`]: q.yearTo ? `${q.yearTo}-12-31` : q.sort === 'recent' ? new Date().toISOString().slice(0, 10) : undefined,
    'vote_average.gte': q.minRating ?? undefined
  })
  return page(data, q.type)
}

export async function search(query: string, pageNo = 1): Promise<TitlePage> {
  if (!query.trim()) return { items: [], page: 1, totalPages: 0, totalResults: 0 }
  return page(await tmdb<RawPage>('/search/multi', { query: query.trim(), page: pageNo, include_adult: 'false' }, 10 * 60_000))
}

export async function home(): Promise<MoviesHome> {
  const mine = getValue('myProviders')
  const base: DiscoverQuery = { type: 'movie', genres: [], runtimeMin: null, runtimeMax: null, providers: [], yearFrom: null, yearTo: null, minRating: null, sort: 'popular', page: 1 }
  const [trending, nowPlaying, streaming, series, topRated] = await Promise.all([
    tmdb<RawPage>('/trending/all/week').then((p) => summaries(p.results)),
    tmdb<RawPage>('/movie/now_playing', { region: region() }).then((p) => summaries(p.results, 'movie')),
    // "On your services" when the user told us which ones they have; otherwise the big ones in the region.
    providers()
      .then((all) => discover({ ...base, providers: mine.length ? mine : all.slice(0, 6).map((p) => p.id) }))
      .then((p) => p.items),
    tmdb<RawPage>('/trending/tv/week').then((p) => summaries(p.results, 'tv')),
    discover({ ...base, sort: 'rating' }).then((p) => p.items)
  ])
  return { trending, nowPlaying, streaming, series, topRated }
}

// ── Details ──────────────────────────────────────────────────────────────────

interface RawVideo {
  key: string
  name: string
  type: string
  site: string
  iso_639_1: string | null
  official: boolean
}
interface RawProviderList {
  link?: string
  flatrate?: RawProvider[]
  free?: RawProvider[]
  ads?: RawProvider[]
  rent?: RawProvider[]
  buy?: RawProvider[]
}
interface RawProvider {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority: number
}
interface RawDetails extends RawTitle {
  tagline?: string
  genres?: Genre[]
  runtime?: number | null
  episode_run_time?: number[]
  last_episode_to_air?: { runtime?: number | null } | null
  status?: string
  imdb_id?: string | null
  external_ids?: { imdb_id?: string | null }
  created_by?: { name: string }[]
  videos?: { results: RawVideo[] }
  credits?: { cast: { id: number; name: string; character: string; profile_path: string | null }[]; crew: { name: string; job: string }[] }
  aggregate_credits?: { cast: { id: number; name: string; profile_path: string | null; roles: { character: string }[] }[] }
  'watch/providers'?: { results: Record<string, RawProviderList> }
  recommendations?: { results: RawTitle[] }
  release_dates?: { results: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[] }
  content_ratings?: { results: { iso_3166_1: string; rating: string }[] }
  seasons?: { season_number: number; name: string; episode_count: number; air_date: string | null; poster_path: string | null }[]
}

const providerList = (list: RawProvider[] | undefined): WatchProvider[] =>
  (list ?? []).sort((a, b) => a.display_priority - b.display_priority).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: img(p.logo_path, 'w92') }))

/**
 * Trailers on YouTube, best first: Portuguese (dubbed/subtitled) official trailers,
 * then any trailer, then teasers. Clips and featurettes stay in `videos`.
 */
function pickVideos(raw: RawVideo[] | undefined): { trailer: TitleVideo | null; videos: TitleVideo[] } {
  const yt = (raw ?? []).filter((v) => v.site === 'YouTube')
  const score = (v: RawVideo): number =>
    (v.type === 'Trailer' ? 100 : v.type === 'Teaser' ? 50 : 0) + (v.iso_639_1 === 'pt' ? 20 : 0) + (v.official ? 5 : 0)
  const sorted = [...yt].sort((a, b) => score(b) - score(a))
  const toVideo = (v: RawVideo): TitleVideo => ({ key: v.key, name: v.name, type: v.type, lang: v.iso_639_1 })
  const best = sorted.find((v) => v.type === 'Trailer' || v.type === 'Teaser')
  return { trailer: best ? toVideo(best) : null, videos: sorted.slice(0, 12).map(toVideo) }
}

function certification(d: RawDetails, type: MediaType, r: string): string | null {
  if (type === 'tv') return d.content_ratings?.results.find((x) => x.iso_3166_1 === r)?.rating || null
  const dates = d.release_dates?.results.find((x) => x.iso_3166_1 === r)?.release_dates ?? []
  // Prefer the theatrical rating (type 3), then any non-empty one.
  return (dates.find((x) => x.type === 3 && x.certification) ?? dates.find((x) => x.certification))?.certification || null
}

export async function details(type: MediaType, id: number): Promise<TitleDetails> {
  const r = region()
  const extra = type === 'movie' ? 'videos,credits,watch/providers,recommendations,release_dates' : 'videos,aggregate_credits,watch/providers,recommendations,content_ratings,external_ids'
  // Videos: Portuguese first, English and language-less as fallback (many trailers have no pt version).
  const d = await tmdb<RawDetails>(`/${type}/${id}`, { append_to_response: extra, include_video_language: 'pt,en,null' })
  const base = summary(d, type)!
  const prov = d['watch/providers']?.results[r]
  const cast: CastMember[] =
    type === 'movie'
      ? (d.credits?.cast ?? []).slice(0, 16).map((c) => ({ id: c.id, name: c.name, role: c.character, photo: img(c.profile_path, 'w185') }))
      : (d.aggregate_credits?.cast ?? []).slice(0, 16).map((c) => ({ id: c.id, name: c.name, role: c.roles[0]?.character ?? '', photo: img(c.profile_path, 'w185') }))
  const seasons: SeasonSummary[] = (d.seasons ?? [])
    .filter((s) => s.episode_count > 0)
    // Specials ("Temporada 0") go last.
    .sort((a, b) => (a.season_number || 999) - (b.season_number || 999))
    .map((s) => ({ number: s.season_number, name: s.name, episodes: s.episode_count, year: s.air_date ? Number(s.air_date.slice(0, 4)) : null, poster: img(s.poster_path, 'w185') }))
  return {
    ...base,
    backdrop: img(d.backdrop_path, 'original') ?? base.backdrop,
    genreIds: (d.genres ?? []).map((g) => g.id),
    tagline: d.tagline || null,
    genres: d.genres ?? [],
    runtime: type === 'movie' ? (d.runtime ?? null) : (d.episode_run_time?.[0] ?? d.last_episode_to_air?.runtime ?? null),
    releaseDate: d.release_date || d.first_air_date || null,
    status: d.status ?? null,
    certification: certification(d, type, r),
    makers: type === 'movie' ? (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name) : (d.created_by ?? []).map((c) => c.name),
    cast,
    ...pickVideos(d.videos?.results),
    providers: {
      link: prov?.link ?? null,
      flatrate: providerList(prov?.flatrate),
      free: providerList([...(prov?.free ?? []), ...(prov?.ads ?? [])]),
      rent: providerList(prov?.rent),
      buy: providerList(prov?.buy)
    },
    recommendations: summaries(d.recommendations?.results).slice(0, 12),
    seasons,
    imdbId: d.imdb_id ?? d.external_ids?.imdb_id ?? null
  }
}

export async function season(id: number, n: number): Promise<Episode[]> {
  const d = await tmdb<{ episodes: { episode_number: number; name: string; overview: string; runtime: number | null; air_date: string | null; still_path: string | null; vote_average: number }[] }>(
    `/tv/${id}/season/${n}`
  )
  return d.episodes.map((e) => ({
    number: e.episode_number,
    name: e.name,
    overview: e.overview,
    runtime: e.runtime,
    airDate: e.air_date,
    still: img(e.still_path, 'w300'),
    rating: Math.round(e.vote_average * 10) / 10
  }))
}

// ── "Chegou no streaming" alerts ─────────────────────────────────────────────

/**
 * For titles on "Quero ver": notifies when one becomes available to stream in the
 * user's region (on one of their services, if they picked any). The first check
 * of a title only records where it already is.
 */
async function checkWatchlist(): Promise<void> {
  if (!TOKEN) return
  const want = getValue('watchlist')
    .filter((w) => w.status === 'want')
    .slice(0, MAX_ALERT_CHECKS)
  if (!want.length) return
  const mine = new Set(getValue('myProviders'))
  const r = region()
  const seen = { ...getPrivate('watchProvidersSeen') }
  for (const w of want) {
    let now: WatchProvider[]
    try {
      const d = await tmdb<{ results: Record<string, RawProviderList> }>(`/${w.type}/${w.id}/watch/providers`, {}, 6 * HOUR)
      const p = d.results[r]
      now = providerList([...(p?.flatrate ?? []), ...(p?.free ?? []), ...(p?.ads ?? [])])
    } catch {
      continue
    }
    const key = `${r}:${w.key}`
    const before = seen[key]
    seen[key] = now.map((p) => p.id)
    if (!before) continue
    const arrived = now.filter((p) => !before.includes(p.id) && (!mine.size || mine.has(p.id)))
    if (!arrived.length) continue
    notify({
      kind: 'watch',
      title: `${w.title} chegou ${arrived.length === 1 ? `na ${arrived[0].name}` : 'no streaming'}`,
      body: `Disponível em ${arrived.slice(0, 3).map((p) => p.name).join(', ')}${arrived.length > 3 ? ` e mais ${arrived.length - 3}` : ''} · está na sua lista "Quero ver"`,
      image: w.poster,
      view: 'movies'
    })
  }
  setPrivate('watchProvidersSeen', seen)
}

export function startMovies(): void {
  if (!TOKEN) return
  // Warm the cache (and the TLS connection) so the module opens fast the first time.
  setTimeout(() => void home().catch(() => undefined), 15_000)
  setTimeout(() => void checkWatchlist().catch(() => undefined), ALERT_FIRST_DELAY_MS)
  setInterval(() => void checkWatchlist().catch(() => undefined), ALERT_EVERY_MS)
}
