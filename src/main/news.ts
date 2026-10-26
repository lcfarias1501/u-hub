import type { BrowserWindow } from 'electron'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import type { ArticleBlock, ArticleContent, FeedDiscovery, NewsItem, NewsSnapshot, NewsSource } from '@shared/types'
import { snapshot as librarySnapshot } from './games'
import { notify } from './notifications'
import { getPrivate, getValue, onValueChange, setPrivate, setValue } from './storage'

const REFRESH_MS = 30 * 60_000
const FIRST_REFRESH_DELAY_MS = 8_000
const NEWS_PER_GAME = 5
const MAX_STEAM_GAMES = 15
const PER_FEED = 25
const MAX_NEWS = 400
const DAY_MS = 86_400_000
const UA = 'Mozilla/5.0 (U-Hub; +https://github.com/lcfarias1501/u-hub)'

/** Sources that ship with the app. They can be disabled but not removed, so new ones reach old installs too. */
const BUILTIN: Omit<NewsSource, 'enabled'>[] = [
  { id: 'ign-br', name: 'IGN Brasil', url: 'https://br.ign.com/feed.xml', category: 'games' },
  { id: 'adrenaline', name: 'Adrenaline', url: 'https://www.adrenaline.com.br/feed/', category: 'games' },
  { id: 'pcgamer', name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', category: 'games' },
  { id: 'tecnoblog', name: 'Tecnoblog', url: 'https://tecnoblog.net/feed/', category: 'tech' },
  { id: 'canaltech', name: 'Canaltech', url: 'https://canaltech.com.br/rss/', category: 'tech' },
  { id: 'olhardigital', name: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/', category: 'tech' },
  { id: 'g1', name: 'g1', url: 'https://g1.globo.com/rss/g1/', category: 'world' },
  { id: 'bbc-br', name: 'BBC News Brasil', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml', category: 'world' },
  { id: 'cnn-br', name: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/', category: 'world' },
  { id: 'publico', name: 'Público', url: 'https://feeds.feedburner.com/PublicoRSS', category: 'world' },
  { id: 'ge', name: 'ge', url: 'https://ge.globo.com/rss/ge/', category: 'sports' },
  { id: 'gazeta-esportiva', name: 'Gazeta Esportiva', url: 'https://www.gazetaesportiva.com/feed/', category: 'sports' },
  { id: 'trivela', name: 'Trivela', url: 'https://trivela.com.br/feed/', category: 'sports' },
  { id: 'rollingstone-br', name: 'Rolling Stone Brasil', url: 'https://rollingstone.com.br/feed/', category: 'music' },
  { id: 'tmdqa', name: 'Tenho Mais Discos Que Amigos!', url: 'https://www.tenhomaisdiscosqueamigos.com/feed/', category: 'music' },
  { id: 'billboard', name: 'Billboard', url: 'https://www.billboard.com/feed/', category: 'music' },
  { id: 'rapadura', name: 'Cinema com Rapadura', url: 'https://cinemacomrapadura.com.br/feed/', category: 'movies' },
  { id: 'pipoca', name: 'Pipoca Moderna', url: 'https://pipocamoderna.com.br/feed/', category: 'movies' },
  { id: 'cinepop', name: 'CinePOP', url: 'https://cinepop.com.br/feed/', category: 'movies' },
  { id: 'g1-ciencia', name: 'g1 Ciência e Saúde', url: 'https://g1.globo.com/rss/g1/ciencia-e-saude/', category: 'science' },
  { id: 'galileu', name: 'Revista Galileu', url: 'https://revistagalileu.globo.com/rss/galileu/', category: 'science' },
  { id: 'infomoney', name: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', category: 'economy' },
  { id: 'g1-economia', name: 'g1 Economia', url: 'https://g1.globo.com/rss/g1/economia/', category: 'economy' }
]
/** English-language extras start switched off. */
const OFF_BY_DEFAULT = new Set(['pcgamer', 'billboard'])

/**
 * Brings stored sources up to date: pre-0.8 entries get a category (they were all games feeds),
 * unknown ids are the user's own, and built-ins added in later versions are appended.
 */
function migrateSources(): void {
  const stored = getValue('newsSources')
  const builtinIds = new Set(BUILTIN.map((b) => b.id))
  const next: NewsSource[] = stored.map((s) => ({
    ...s,
    category: s.category ?? 'games',
    custom: !builtinIds.has(s.id)
  }))
  for (const b of BUILTIN) if (!next.some((s) => s.id === b.id)) next.push({ ...b, enabled: !OFF_BY_DEFAULT.has(b.id) })
  if (JSON.stringify(next) !== JSON.stringify(stored)) setValue('newsSources', next)
}

// ── Fetching ─────────────────────────────────────────────────────────────────

/** Fetches as text, honouring the charset (several Brazilian feeds are still ISO-8859-1). */
async function fetchText(url: string, timeout = 15_000): Promise<{ text: string; url: string; type: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7' },
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow'
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const type = res.headers.get('content-type') ?? ''
  const head = buf.subarray(0, 1024).toString('latin1')
  const charset = (type.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? 'utf-8').toLowerCase()
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(charset)
  } catch {
    decoder = new TextDecoder('utf-8')
  }
  return { text: decoder.decode(buf), url: res.url || url, type }
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»' }
const decodeEntities = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })

/** Steam bodies are BBCode/HTML and feeds are often escaped HTML; the list only needs plain text. */
const plain = (s: string): string =>
  decodeEntities(
    s
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      // Escaped HTML (&lt;img …&gt;): unescape the brackets first so the tags get stripped too.
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\[img\][\s\S]*?\[\/img\]/gi, ' ')
      .replace(/\[\/?[a-z0-9*]+(=[^\]]*)?\]/gi, ' ')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{STEAM_CLAN_IMAGE\}\S*/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim()

const tag = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim() : null
}
const attr = (xml: string, name: string, a: string): string | null =>
  xml.match(new RegExp(`<${name}(?:\\s[^>]*)?\\s${a}=["']([^"']+)["']`, 'i'))?.[1] ?? null

const absolute = (href: string, base: string): string | null => {
  try {
    return new URL(decodeEntities(href), base).href
  } catch {
    return null
  }
}

/** Atom entries put the article in <link rel="alternate" href>; there can be several links. */
function atomLink(entry: string): string | null {
  const links = entry.match(/<link\b[^>]*>/gi) ?? []
  const pick = links.find((l) => /rel=["']alternate["']/i.test(l)) ?? links.find((l) => !/rel=/i.test(l)) ?? links[0]
  return pick?.match(/href=["']([^"']+)["']/i)?.[1] ?? null
}

interface ParsedFeed {
  title: string | null
  items: { title: string; link: string; date: number; summary: string; image: string | null }[]
}

/** Tiny RSS 2.0 / Atom reader: title, link, date, teaser and the first image it can find. */
function parseFeed(xml: string, base: string): ParsedFeed {
  const atom = !/<item[\s>]/i.test(xml) && /<entry[\s>]/i.test(xml)
  const blocks = xml.match(atom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? []
  const channel = xml.replace(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi, '')
  const items = blocks.slice(0, PER_FEED).flatMap((it) => {
    const title = tag(it, 'title')
    const rawLink = atom ? atomLink(it) : (tag(it, 'link') ?? attr(it, 'link', 'href') ?? tag(it, 'guid'))
    const link = rawLink && absolute(rawLink, base)
    if (!title || !link) return []
    const body = tag(it, 'content:encoded') ?? tag(it, 'content') ?? tag(it, 'description') ?? tag(it, 'summary') ?? ''
    const unescaped = body.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    const img =
      attr(it, 'media:content', 'url') ??
      attr(it, 'media:thumbnail', 'url') ??
      attr(it, 'enclosure', 'url') ??
      unescaped.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ??
      null
    const date = Date.parse(tag(it, 'pubDate') ?? tag(it, 'published') ?? tag(it, 'updated') ?? tag(it, 'dc:date') ?? '') || Date.now()
    const teaser = tag(it, 'description') ?? tag(it, 'summary') ?? body
    return [{ title: plain(title), link, date, summary: plain(teaser).slice(0, 320), image: img ? absolute(img, base) : null }]
  })
  return { title: tag(channel, 'title') ? plain(tag(channel, 'title')!) : null, items }
}

/** RSS/Atom root after any BOM, <?xml …?>/<?xml-stylesheet …?> declarations, comments and doctype. */
const looksLikeFeed = (text: string): boolean => /^\uFEFF?\s*(<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<(rss|feed|rdf:RDF)[\s>]/i.test(text)

async function fetchFeed(src: NewsSource): Promise<NewsItem[]> {
  const { text, url } = await fetchText(src.url)
  if (!looksLikeFeed(text)) throw new Error('não é um feed RSS/Atom')
  return parseFeed(text, url).items.map((i) => ({
    id: `rss:${i.link}`,
    title: i.title,
    url: i.link,
    date: Math.min(i.date, Date.now()),
    summary: i.summary,
    image: i.image,
    source: src.name,
    kind: 'rss',
    category: src.category,
    patch: false
  }))
}

// ── Steam announcements of the user's games ─────────────────────────────────

interface SteamNews {
  gid: string
  title: string
  url: string
  date: number
  contents: string
  feedname: string
  tags?: string[]
}

/** Steam games worth following: the most recently played installed ones, plus the wishlist. */
function followedSteamGames(): { appid: number; name: string; played: boolean }[] {
  const lib = librarySnapshot()
  const owned = lib.games
    .filter((g) => g.source === 'steam')
    .map((g) => {
      const p = lib.playtime[g.id]
      return { appid: Number(g.id.slice(6)), name: g.name, last: Math.max(p?.lastPlayed ?? 0, g.sourceLastPlayed ?? 0) }
    })
    .sort((a, b) => b.last - a.last)
    .slice(0, MAX_STEAM_GAMES)
  const recent = Date.now() - 30 * DAY_MS
  const out = owned.map((g) => ({ appid: g.appid, name: g.name, played: g.last > recent }))
  for (const w of getValue('wishlist')) if (!out.some((g) => g.appid === w.appid)) out.push({ appid: w.appid, name: w.name, played: false })
  return out
}

async function fetchSteamNews(): Promise<{ items: NewsItem[]; played: Set<number> }> {
  const games = followedSteamGames()
  const played = new Set(games.filter((g) => g.played).map((g) => g.appid))
  const results = await Promise.allSettled(
    games.map(async (g) => {
      const { text } = await fetchText(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${g.appid}&count=${NEWS_PER_GAME}&maxlength=600&format=json`)
      const data = JSON.parse(text) as { appnews: { newsitems: SteamNews[] } }
      return data.appnews.newsitems
        // Only the developer's own announcements; third-party press feeds are often other languages.
        .filter((n) => n.feedname === 'steam_community_announcements')
        .map(
          (n): NewsItem => ({
            id: `steam:${n.gid}`,
            title: n.title,
            url: n.url,
            date: n.date * 1000,
            summary: plain(n.contents).slice(0, 320),
            image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
            source: g.name,
            kind: 'steam',
            category: 'games',
            appid: g.appid,
            patch: !!n.tags?.includes('patchnotes') || /\b(patch|update|hotfix|atualiza)/i.test(n.title)
          })
        )
    })
  )
  return { items: results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])), played }
}

// ── Orchestration ────────────────────────────────────────────────────────────

let state: NewsSnapshot = { items: [], updatedAt: null, refreshing: false, errors: [] }
let getWin: () => BrowserWindow | null = () => null
const emit = (): void => getWin()?.webContents.send('news:update', state)

export const newsSnapshot = (): NewsSnapshot => state

/**
 * Fetches every enabled source of the followed categories (Steam news when Games is followed).
 * A failing source is reported but never blocks the others; its previous items are kept.
 */
let again = false
export async function refreshNews(): Promise<NewsSnapshot> {
  if (state.refreshing) {
    // Settings changed mid-fetch: run once more with them when this one ends.
    again = true
    return state
  }
  state = { ...state, refreshing: true, errors: [] }
  emit()

  const follow = new Set(getValue('newsFollow'))
  const sources = getValue('newsSources').filter((s) => s.enabled && follow.has(s.category))
  const errors: string[] = []
  const previous = (pred: (n: NewsItem) => boolean): NewsItem[] => state.items.filter(pred)

  const [steam, ...feeds] = await Promise.all([
    follow.has('games')
      ? fetchSteamNews().catch((e: Error) => {
          errors.push(`Notícias Steam: ${e.message}`)
          return { items: previous((n) => n.kind === 'steam'), played: new Set<number>() }
        })
      : Promise.resolve({ items: [] as NewsItem[], played: new Set<number>() }),
    ...sources.map((s) =>
      fetchFeed(s).catch((e: Error) => {
        errors.push(`${s.name}: ${e.name === 'TimeoutError' ? 'tempo esgotado' : e.message}`)
        return previous((n) => n.kind === 'rss' && n.source === s.name)
      })
    )
  ])

  const seen = new Set<string>()
  const items = [...steam.items, ...feeds.flat()]
    .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
    .sort((a, b) => b.date - a.date)
    .slice(0, MAX_NEWS)
  announcePatches(steam.items, steam.played)

  state = { items, updatedAt: Date.now(), refreshing: false, errors }
  setPrivate('newsCache', { items, updatedAt: state.updatedAt })
  emit()
  if (again) {
    again = false
    void refreshNews()
  }
  return state
}

/** Patch notes of games played in the last 30 days. The first run only records what exists, so installing doesn't spam. */
function announcePatches(steamNews: NewsItem[], played: Set<number>): void {
  const seen = getPrivate('radarSeen')
  if (seen.news.length > 0) {
    const weekAgo = Date.now() - 7 * DAY_MS
    for (const n of steamNews.filter((x) => x.patch && x.appid && played.has(x.appid) && x.date > weekAgo && !seen.news.includes(x.id))) {
      notify({ kind: 'patch', title: `Atualização: ${n.source}`, body: n.title, url: n.url, image: n.image, view: 'news' })
    }
  }
  if (!steamNews.length) return
  setPrivate('radarSeen', { ...getPrivate('radarSeen'), news: [...new Set([...seen.news, ...steamNews.map((n) => n.id)])].slice(-1000) })
}

// ── Adding a source ──────────────────────────────────────────────────────────

const COMMON_FEED_PATHS = ['/feed/', '/rss/', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feeds/posts/default']

/**
 * Turns whatever the user pasted (a site, a section page or a feed) into a feed URL:
 * the URL itself if it is a feed, else the page's <link rel="alternate">, else the usual paths.
 */
export async function discoverFeed(input: string): Promise<FeedDiscovery> {
  let raw = input.trim()
  if (!raw) return { ok: false, error: 'Cole o endereço do site ou do feed.' }
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  let start: URL
  try {
    start = new URL(raw)
  } catch {
    return { ok: false, error: 'Endereço inválido.' }
  }

  const tryFeed = async (url: string): Promise<FeedDiscovery | null> => {
    try {
      const { text, url: final } = await fetchText(url, 10_000)
      if (!looksLikeFeed(text)) return null
      const feed = parseFeed(text, final)
      if (!feed.items.length) return null
      // A feed hosted elsewhere (tecmundo → estadao.com.br) carries the host's name; use the site the user typed.
      const site = (h: string): string => h.replace(/^www\./, '').split('.')[0]
      const sameSite = site(new URL(final).hostname) === site(start.hostname)
      const fallback = site(start.hostname).replace(/^./, (c) => c.toUpperCase())
      return { ok: true, url: final, title: (sameSite && feed.title) || fallback, sample: feed.items.slice(0, 3).map((i) => i.title) }
    } catch {
      return null
    }
  }

  let page: { text: string; url: string }
  try {
    page = await fetchText(start.href, 12_000)
  } catch (e) {
    return { ok: false, error: `Não foi possível abrir o site (${(e as Error).message}).` }
  }
  if (looksLikeFeed(page.text)) return (await tryFeed(page.url)) ?? { ok: false, error: 'O feed está vazio.' }

  const alternates = (page.text.match(/<link\b[^>]*>/gi) ?? [])
    .filter((l) => /rel=["']?alternate/i.test(l) && /type=["']?application\/(rss|atom)\+xml/i.test(l))
    .map((l) => l.match(/href=["']([^"']+)["']/i)?.[1])
    .filter((h): h is string => !!h)
    .map((h) => absolute(h, page.url))
    .filter((h): h is string => !!h)
    // Comment feeds are rarely what anyone wants.
    .sort((a, b) => Number(/comment/i.test(a)) - Number(/comment/i.test(b)))
  const origin = new URL(page.url).origin
  const candidates = [...new Set([...alternates, ...COMMON_FEED_PATHS.map((p) => origin + p)])]
  for (const c of candidates) {
    const found = await tryFeed(c)
    if (found) return found
  }
  return { ok: false, error: 'Não achei um feed RSS neste site. Se o site tiver um, cole o link do feed direto.' }
}

// ── Reader mode ──────────────────────────────────────────────────────────────

const articleCache = new Map<string, ArticleContent>()

const BLOCK_TAGS: Record<string, 'p' | 'h' | 'quote' | 'li'> = { P: 'p', H1: 'h', H2: 'h', H3: 'h', H4: 'h', H5: 'h', H6: 'h', BLOCKQUOTE: 'quote', LI: 'li', PRE: 'p' }
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'FORM', 'BUTTON', 'NOSCRIPT', 'svg', 'SVG', 'NAV', 'ASIDE'])
/** The slice of linkedom's DOM this file uses (the main tsconfig has no DOM lib). */
interface El {
  tagName: string
  children: ArrayLike<El>
  textContent: string | null
  getAttribute(name: string): string | null
  querySelector(sel: string): El | null
  querySelectorAll(sel: string): ArrayLike<El>
}
/** Leftover ad slots and share prompts that Readability keeps as paragraphs. */
const AD_MARKER = /^(publicidade|continua (depois|ap[oó]s) (da|a) publicidade|advertisement|an[uú]ncio|leia (tamb[eé]m|mais)|siga.{0,40}(no|nas redes)|compartilh(e|ar)( esta (not[ií]cia|mat[eé]ria))?)[:.!\s]*$/i
/** Photo captions with credits ("… — Foto: Fulano/Agência") read badly aloud. */
const PHOTO_CREDIT = /^.{0,240}(^|[—–|-]\s*)(foto|fotos|imagem|crédito|reprodução)\s*:\s*[^.]{0,80}$/i
const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim()

/** Flattens Readability's HTML into paragraphs/headings/images in reading order. */
function toBlocks(root: El, base: string): ArticleBlock[] {
  const out: ArticleBlock[] = []
  const pushImg = (img: El, caption: string | null): void => {
    const src = img.getAttribute('data-src') ?? img.getAttribute('data-lazy-src') ?? img.getAttribute('src')
    const abs = src && !src.startsWith('data:') ? absolute(src, base) : null
    if (abs && !out.some((b) => b.kind === 'img' && b.src === abs)) out.push({ kind: 'img', src: abs, caption })
  }
  const walk = (el: El): void => {
    for (const child of Array.from(el.children)) {
      const tagName = child.tagName.toUpperCase()
      if (SKIP_TAGS.has(tagName)) continue
      if (tagName === 'IMG') {
        pushImg(child, clean(child.getAttribute('alt')) || null)
        continue
      }
      if (tagName === 'FIGURE') {
        const img = child.querySelector('img')
        if (img) pushImg(img, clean(child.querySelector('figcaption')?.textContent) || null)
        continue
      }
      const kind = BLOCK_TAGS[tagName]
      // A list item or quote holding paragraphs is a container, not a block.
      if (kind && !(kind !== 'p' && child.querySelector('p'))) {
        for (const img of Array.from(child.querySelectorAll('img'))) pushImg(img, null)
        const text = clean(child.textContent)
        if (text.length > 1 && !AD_MARKER.test(text) && !PHOTO_CREDIT.test(text)) out.push({ kind, text })
        continue
      }
      walk(child)
    }
  }
  walk(root)
  // Loose text directly inside a container (no <p>) would be lost; fall back to the whole text.
  if (!out.some((b) => b.kind !== 'img')) {
    for (const para of (root.textContent ?? '').split(/\n\s*\n/).map(clean).filter((t) => t.length > 1)) out.push({ kind: 'p', text: para })
  }
  return out
}

/** Extracts the article body with Readability. On failure the renderer falls back to the feed summary. */
export async function readArticle(url: string): Promise<ArticleContent> {
  const cached = articleCache.get(url)
  if (cached) return cached
  const fail = (error: string): ArticleContent => ({ ok: false, url, title: '', byline: null, siteName: null, blocks: [], image: null, lang: null, error })
  if (!/^https?:\/\//i.test(url)) return fail('Endereço inválido.')
  try {
    const page = await fetchText(url, 15_000)
    if (!/html/i.test(page.type) && !/<html/i.test(page.text.slice(0, 2000))) return fail('A página não é um artigo.')
    const { document } = parseHTML(page.text)
    // Readability mutates the document; read the metadata it doesn't return first.
    const parsed = new Readability(document.cloneNode(true) as unknown as Document, { charThreshold: 400 }).parse()
    if (!parsed?.content || (parsed.textContent ?? '').trim().length < 300) return fail('Não deu para extrair o texto desta página.')

    const { document: body } = parseHTML(`<!doctype html><html><body>${parsed.content}</body></html>`)
    const blocks = toBlocks(body.body as unknown as El, page.url)
    if (blocks.filter((x) => x.kind !== 'img').length < 2) return fail('Não deu para extrair o texto desta página.')
    const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')
    const result: ArticleContent = {
      ok: true,
      url: page.url,
      title: parsed.title?.trim() || '',
      byline: parsed.byline?.trim() || null,
      siteName: parsed.siteName ?? null,
      blocks,
      image: ogImage ? absolute(ogImage, page.url) : null,
      lang: parsed.lang ?? document.documentEl?.getAttribute('lang') ?? null
    }
    articleCache.set(url, result)
    if (articleCache.size > 60) articleCache.delete(articleCache.keys().next().value!)
    return result
  } catch (e) {
    const err = e as Error
    return fail(err.name === 'TimeoutError' ? 'O site demorou demais para responder.' : `Não foi possível abrir a página (${err.message}).`)
  }
}

export function startNews(win: () => BrowserWindow | null): void {
  getWin = win
  migrateSources()
  const cache = getPrivate('newsCache')
  if (cache) state = { ...cache, refreshing: false, errors: [] }
  else {
    // Pre-0.8 installs kept news inside the radar cache: show it until the first fetch lands.
    const legacy = getPrivate('radarCache') as { news?: NewsItem[] } | null
    if (legacy?.news?.length) state = { ...state, items: legacy.news.map((n) => ({ ...n, category: n.category ?? 'games' })) }
  }
  setTimeout(() => void refreshNews(), FIRST_REFRESH_DELAY_MS)
  setInterval(() => void refreshNews(), REFRESH_MS)
  // Following a category or adding/enabling a source should show its news without waiting.
  let last = JSON.stringify([getValue('newsFollow'), getValue('newsSources').map((s) => [s.id, s.enabled, s.category, s.url])])
  const changed = (): void => {
    const next = JSON.stringify([getValue('newsFollow'), getValue('newsSources').map((s) => [s.id, s.enabled, s.category, s.url])])
    if (next === last) return
    last = next
    migrateSources()
    void refreshNews()
  }
  onValueChange('newsFollow', changed)
  onValueChange('newsSources', changed)
}
