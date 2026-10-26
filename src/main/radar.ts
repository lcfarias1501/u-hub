import { app, type BrowserWindow } from 'electron'
import type { Deal, FreeGame, RadarSnapshot, SteamSearchResult, WishlistItem } from '@shared/types'
import { notify } from './notifications'
import { getPrivate, getSettings, getValue, onSettingsChange, onValueChange, setPrivate, setValue } from './storage'

const REFRESH_MS = 3 * 60 * 60_000
const FIRST_REFRESH_DELAY_MS = 20_000
const UA = 'Mozilla/5.0 (U-Hub; +https://github.com/lcfarias1501/u-hub)'

/** Storefront region: the user's choice in Settings, else the OS region (BR → BRL, PT → EUR…). */
const cc = (): string => {
  const chosen = getSettings().storeCountry
  return (chosen && chosen !== 'auto' ? chosen : app.getLocaleCountryCode() || 'BR').toLowerCase()
}
const steamLang = (): string => (app.getLocale().startsWith('pt') ? 'portuguese' : 'english')

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}
const fetchJson = async <T>(url: string): Promise<T> => JSON.parse(await fetchText(url)) as T

// ── Epic free games ──────────────────────────────────────────────────────────

interface EpicOffer {
  startDate: string
  endDate: string
  discountSetting: { discountPercentage: number }
}
interface EpicElement {
  id: string
  title: string
  productSlug?: string | null
  catalogNs?: { mappings?: { pageSlug: string }[] | null }
  offerMappings?: { pageSlug: string }[] | null
  keyImages: { type: string; url: string }[]
  price?: { totalPrice?: { fmtPrice?: { originalPrice?: string } } }
  promotions?: {
    promotionalOffers?: { promotionalOffers: EpicOffer[] }[]
    upcomingPromotionalOffers?: { promotionalOffers: EpicOffer[] }[]
  } | null
}

async function fetchFreeGames(): Promise<FreeGame[]> {
  const country = cc().toUpperCase()
  const data = await fetchJson<{ data: { Catalog: { searchStore: { elements: EpicElement[] } } } }>(
    `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=pt-BR&country=${country}&allowCountries=${country}`
  )
  const out: FreeGame[] = []
  for (const e of data.data.Catalog.searchStore.elements) {
    // discountPercentage 0 means "pays 0%" → free. Other promotions are ordinary sales.
    const pick = (groups?: { promotionalOffers: EpicOffer[] }[]): EpicOffer | undefined =>
      groups?.flatMap((g) => g.promotionalOffers).find((o) => o.discountSetting.discountPercentage === 0)
    const now = pick(e.promotions?.promotionalOffers)
    const upcoming = pick(e.promotions?.upcomingPromotionalOffers)
    const offer = now ?? upcoming
    if (!offer) continue
    const slug = e.productSlug || e.catalogNs?.mappings?.[0]?.pageSlug || e.offerMappings?.[0]?.pageSlug
    const img = (t: string): string | undefined => e.keyImages.find((k) => k.type === t)?.url
    out.push({
      id: `epic:${e.id}:${offer.startDate}`,
      title: e.title,
      image: img('OfferImageWide') ?? img('DieselStoreFrontWide') ?? img('Thumbnail') ?? null,
      url: slug ? `https://store.epicgames.com/pt-BR/p/${slug}` : 'https://store.epicgames.com/pt-BR/free-games',
      originalPrice: e.price?.totalPrice?.fmtPrice?.originalPrice ?? null,
      startsAt: Date.parse(offer.startDate),
      endsAt: Date.parse(offer.endDate),
      status: now ? 'now' : 'upcoming'
    })
  }
  return out.sort((a, b) => Number(b.status === 'now') - Number(a.status === 'now') || a.startsAt - b.startsAt)
}

// ── Steam deals, search and prices ───────────────────────────────────────────

interface SteamFeaturedItem {
  id: number
  name: string
  discounted?: boolean
  discount_percent: number
  original_price: number | null
  final_price: number
  currency: string
  header_image: string
  discount_expiration?: number
}

async function fetchDeals(): Promise<Deal[]> {
  const data = await fetchJson<Record<string, { items?: SteamFeaturedItem[] }>>(
    `https://store.steampowered.com/api/featuredcategories?cc=${cc()}&l=${steamLang()}`
  )
  const seen = new Map<number, Deal>()
  // "specials" alone is only ~10 games; discounted top sellers and releases fill it out.
  for (const key of ['specials', 'top_sellers', 'new_releases', 'coming_soon']) {
    for (const i of data[key]?.items ?? []) {
      if (!i.discount_percent || seen.has(i.id)) continue
      seen.set(i.id, {
        appid: i.id,
        name: i.name,
        image: i.header_image,
        discount: i.discount_percent,
        initial: i.original_price ?? i.final_price,
        final: i.final_price,
        currency: i.currency,
        endsAt: i.discount_expiration ? i.discount_expiration * 1000 : null
      })
    }
  }
  return [...seen.values()].sort((a, b) => b.discount - a.discount)
}

export async function searchSteam(term: string): Promise<SteamSearchResult[]> {
  if (!term.trim()) return []
  const data = await fetchJson<{ items: { id: number; name: string; tiny_image: string; price?: { final: number; currency: string } }[] }>(
    `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term.trim())}&cc=${cc()}&l=${steamLang()}`
  )
  return data.items.map((i) => ({
    appid: i.id,
    name: i.name,
    image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${i.id}/header.jpg`,
    final: i.price?.final ?? null,
    currency: i.price?.currency ?? null
  }))
}

interface PriceOverview {
  currency: string
  initial: number
  final: number
  discount_percent: number
}

const money = (cents: number, currency: string): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100)

/** Refreshes wishlist prices (one batched request per 50 games) and alerts on new discounts / target hits. */
async function refreshWishlist(): Promise<void> {
  const list = getValue('wishlist')
  if (!list.length) return
  const prices = new Map<number, PriceOverview | null>()
  for (let i = 0; i < list.length; i += 50) {
    const ids = list.slice(i, i + 50).map((w) => w.appid)
    const data = await fetchJson<Record<string, { success: boolean; data?: { price_overview?: PriceOverview } | [] }>>(
      `https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&cc=${cc()}&filters=price_overview`
    )
    for (const [id, v] of Object.entries(data)) {
      prices.set(Number(id), v.success && v.data && !Array.isArray(v.data) ? (v.data.price_overview ?? null) : null)
    }
  }

  // Re-read in case the user edited the list while we were fetching.
  const next = getValue('wishlist').map((w): WishlistItem => {
    const p = prices.get(w.appid)
    if (p === undefined) return w
    if (p === null) return { ...w, checkedAt: Date.now() } // free or not on sale in this region
    // Region changed (e.g. Settings → store region): old prices and targets were another currency.
    if (w.currency && w.currency !== p.currency) {
      return { ...w, currency: p.currency, final: p.final, initial: p.initial, discount: p.discount_percent, lowest: p.final, target: null, checkedAt: Date.now() }
    }
    const wasDiscounted = w.discount > 0
    const hitTarget = w.target != null && p.final <= w.target && (w.final == null || w.final > w.target)
    if (w.checkedAt && ((!wasDiscounted && p.discount_percent > 0 && w.target == null) || hitTarget)) {
      notify({
        kind: 'price',
        title: hitTarget ? `${w.name} chegou no seu preço` : `${w.name} entrou em promoção`,
        body: `${money(p.final, p.currency)}${p.discount_percent ? ` (-${p.discount_percent}%)` : ''} na Steam`,
        url: `https://store.steampowered.com/app/${w.appid}`,
        image: w.image,
        view: 'radar'
      })
    }
    return {
      ...w,
      currency: p.currency,
      final: p.final,
      initial: p.initial,
      discount: p.discount_percent,
      lowest: w.lowest == null ? p.final : Math.min(w.lowest, p.final),
      checkedAt: Date.now()
    }
  })
  setValue('wishlist', next)
}

// ── Orchestration ────────────────────────────────────────────────────────────

let state: RadarSnapshot = { free: [], deals: [], updatedAt: null, refreshing: false, errors: [] }
let getWin: () => BrowserWindow | null = () => null
const emit = (): void => getWin()?.webContents.send('radar:update', state)

export const radarSnapshot = (): RadarSnapshot => state

/** Fetches everything in parallel; a failing source is reported but never blocks the others. */
export async function refreshRadar(): Promise<RadarSnapshot> {
  if (state.refreshing) return state
  state = { ...state, refreshing: true, errors: [] }
  emit()

  const errors: string[] = []
  const settle = async <T>(label: string, p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`)
      return fallback
    }
  }

  const [free, deals] = await Promise.all([
    settle('Epic', fetchFreeGames(), state.free),
    settle('Steam ofertas', fetchDeals(), state.deals),
    settle('Lista de desejos', refreshWishlist(), undefined)
  ])

  announce(free)

  state = { free, deals, updatedAt: Date.now(), refreshing: false, errors }
  setPrivate('radarCache', { free, deals, updatedAt: state.updatedAt })
  emit()
  return state
}

/** Notifies new free games. The first run only records what exists, so installing doesn't spam. */
function announce(free: FreeGame[]): void {
  const seen = getPrivate('radarSeen')
  if (seen.free.length > 0) {
    for (const f of free.filter((x) => x.status === 'now' && !seen.free.includes(x.id))) {
      notify({ kind: 'free', title: `Grátis na Epic: ${f.title}`, body: `Resgate até ${new Date(f.endsAt).toLocaleDateString('pt-BR')}`, url: f.url, image: f.image, view: 'radar' })
    }
  }
  setPrivate('radarSeen', { ...getPrivate('radarSeen'), free: [...new Set([...seen.free, ...free.map((f) => f.id)])].slice(-200) })
}

export function startRadar(win: () => BrowserWindow | null): void {
  getWin = win
  const cache = getPrivate('radarCache')
  if (cache) state = { free: cache.free, deals: cache.deals, updatedAt: cache.updatedAt, refreshing: false, errors: [] }
  setTimeout(() => void refreshRadar(), FIRST_REFRESH_DELAY_MS)
  setInterval(() => void refreshRadar(), REFRESH_MS)
  // Adding a game to the wishlist should show its price right away.
  // New store region → refetch prices in the new currency.
  let lastCountry = getSettings().storeCountry
  onSettingsChange((s) => {
    if (s.storeCountry !== lastCountry) {
      lastCountry = s.storeCountry
      void refreshRadar()
    }
  })
  onValueChange('wishlist', () => {
    if (getValue('wishlist').some((w) => w.checkedAt == null)) void refreshWishlist().catch(() => undefined)
  })
}
