import { useSyncExternalStore } from 'react'
import type { ArticleContent, NewsItem } from '@shared/types'
import { audioEngine } from './audioEngine'

/** One news item in the queue: read in full (reader mode) or as a headline + summary. */
export interface Track {
  item: NewsItem
  full: boolean
}

interface Segment {
  text: string
  /** Article block being read (-1 = the headline). */
  block: number
}

export interface SpeechState {
  status: 'idle' | 'loading' | 'speaking' | 'paused'
  tracks: Track[]
  index: number
  block: number
  /** Extracted article of the current track, when it is read in full. */
  article: ArticleContent | null
  error: string | null
}

const IDLE: SpeechState = { status: 'idle', tracks: [], index: 0, block: -1, article: null, error: null }
const MAX_CHUNK = 220

/** Long utterances get cut off by some engines; split at sentence (then comma) boundaries. */
function chunk(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text]
  const out: string[] = []
  let cur = ''
  for (const part of text.match(/[^.!?…;:]+[.!?…;:]+["”’)]*\s*|[^.!?…;:]+$/g) ?? [text]) {
    if ((cur + part).length > MAX_CHUNK && cur) {
      out.push(cur.trim())
      cur = ''
    }
    if (part.length > MAX_CHUNK) {
      for (const piece of part.split(/(?<=,)\s+/)) {
        if ((cur + piece).length > MAX_CHUNK && cur) {
          out.push(cur.trim())
          cur = ''
        }
        cur += `${piece} `
      }
    } else cur += part
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** Rough language guess for feeds that don't declare one (Steam news, English sites). */
function guessLang(text: string): 'pt' | 'en' | 'es' {
  const words = ` ${text.toLowerCase().slice(0, 1500)} `
  const count = (list: string[]): number => list.reduce((n, w) => n + (words.split(` ${w} `).length - 1), 0)
  const en = count(['the', 'and', 'of', 'to', 'is', 'with', 'for', 'this', 'you'])
  const pt = count(['de', 'que', 'não', 'para', 'com', 'uma', 'os', 'do', 'da', 'em'])
  const es = count(['el', 'los', 'del', 'para', 'con', 'una', 'que', 'por', 'las'])
  return en > pt && en > es ? 'en' : es > pt * 1.3 ? 'es' : 'pt'
}

export const voices = (): SpeechSynthesisVoice[] => speechSynthesis.getVoices()

/** Voices load asynchronously the first time; wait briefly for them. */
function voicesReady(): Promise<void> {
  if (speechSynthesis.getVoices().length) return Promise.resolve()
  return new Promise((resolve) => {
    const done = (): void => {
      speechSynthesis.removeEventListener('voiceschanged', done)
      resolve()
    }
    speechSynthesis.addEventListener('voiceschanged', done)
    setTimeout(done, 1500)
  })
}

const QUALITY = /premium|enhanced|aprimorad|natural|neural|siri/i
/** macOS joke voices. Electron reports names (localized: "Boas notícias", "Sinos"…), so match both languages. */
const NOVELTY =
  /^(albert|bad news|más notícias|bahh|bells|sinos|boing|bubbles|borbulhar|cellos|violoncelos|deranged|good news|boas notícias|hysterical|jester|organ|órgão|pipe organ|princess|superstar|superestrela|trinoids|whisper|sussurro|wobble|oscilador|zarvox)$/i
/** Eloquence ("Eddy (português (Brasil))") and the 90s voices: fine, but robotic next to Luciana/Joana. */
const ROBOTIC = /\(.*\(.*\)\)|^(fred|ralph|kathy|junior|júnior)$/i
/** Downloaded higher-quality voices: "Luciana (Aprimorada)", "Felipe (Premium)", Windows "Natural" voices. */
export const isQuality = (v: SpeechSynthesisVoice): boolean => QUALITY.test(v.name)
export const isNovelty = (v: SpeechSynthesisVoice): boolean => NOVELTY.test(v.name.trim())

/** The user's chosen voice when it speaks this language; otherwise the best local voice for it. */
export function pickVoice(lang: string, preferred: string | null): SpeechSynthesisVoice | null {
  const all = speechSynthesis.getVoices()
  const want = lang.toLowerCase().replace('_', '-')
  const base = want.slice(0, 2)
  const chosen = preferred ? all.find((v) => v.voiceURI === preferred) : undefined
  if (chosen && chosen.lang.toLowerCase().startsWith(base)) return chosen
  const score = (v: SpeechSynthesisVoice): number => {
    const l = v.lang.toLowerCase().replace('_', '-')
    let s = 0
    if (l === want) s += 4
    else if (base === 'pt' && l === 'pt-br') s += 3 // Brazilian Portuguese unless the page says pt-PT
    if (isQuality(v)) s += 3
    if (v.localService) s += 1
    if (ROBOTIC.test(v.name)) s -= 2
    if (isNovelty(v)) s -= 10
    return s
  }
  return all.filter((v) => v.lang.toLowerCase().startsWith(base)).sort((a, b) => score(b) - score(a))[0] ?? null
}

/**
 * Reads news aloud with the system voices (Web Speech API): a queue of tracks,
 * each split into short utterances so pause/skip/speed react immediately and the
 * reader can highlight the paragraph being read. The radio is ducked meanwhile.
 */
class SpeechEngine {
  private state: SpeechState = IDLE
  private listeners = new Set<() => void>()
  private segments: Segment[] = []
  private seg = 0
  /** Bumped on every stop/skip; callbacks from older utterances are ignored. */
  private token = 0
  private lang = 'pt-BR'
  rate = 1
  voiceURI: string | null = null

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getSnapshot = (): SpeechState => this.state

  private patch(p: Partial<SpeechState>): void {
    this.state = { ...this.state, ...p }
    audioEngine.duck(this.state.status === 'speaking' || this.state.status === 'loading')
    // Media keys and the global play/pause shortcut follow the reading while it runs.
    const active = this.state.status !== 'idle'
    if (active !== !!audioEngine.mediaOverride) {
      audioEngine.mediaOverride = active ? { toggle: () => this.toggle(), next: () => this.next(), prev: () => this.prev() } : null
      window.uhub.radio.setSpeaking(active)
    }
    this.listeners.forEach((l) => l())
  }

  get current(): Track | null {
    return this.state.tracks[this.state.index] ?? null
  }

  /** Starts a new queue (replacing whatever was playing). */
  play(tracks: Track[], index = 0, fromBlock = -1): void {
    if (!tracks.length) return
    this.state = { ...IDLE, tracks }
    void this.startTrack(index, fromBlock)
  }

  private async startTrack(index: number, fromBlock = -1): Promise<void> {
    const track = this.state.tracks[index]
    if (!track) return this.stop()
    const token = ++this.token
    speechSynthesis.cancel()
    this.patch({ status: 'loading', index, block: -1, article: null, error: null })

    const [article] = await Promise.all([track.full ? window.uhub.news.article(track.item.url).catch(() => null) : Promise.resolve(null), voicesReady()])
    if (token !== this.token) return

    const { item } = track
    const segs: Segment[] = []
    if (article?.ok) {
      segs.push({ text: article.title || item.title, block: -1 })
      article.blocks.forEach((b, i) => {
        if (b.kind !== 'img') for (const text of chunk(b.text)) segs.push({ text, block: i })
      })
    } else {
      // Briefing (or the site blocks reader mode): source, headline and the feed's summary.
      segs.push({ text: `${item.source}. ${item.title}.`, block: -1 })
      for (const text of chunk(item.summary)) segs.push({ text, block: 0 })
    }
    this.segments = segs
    this.lang = article?.ok && article.lang ? article.lang : guessLang(`${item.title} ${item.summary}`)
    const start = fromBlock < 0 ? 0 : Math.max(0, segs.findIndex((s) => s.block >= fromBlock))
    this.patch({ article: article?.ok ? article : null, error: track.full && !article?.ok ? (article?.error ?? 'Não deu para abrir o artigo; lendo o resumo.') : null })
    this.speak(start)

    // Warm the next article so the gap between tracks stays short.
    const next = this.state.tracks[index + 1]
    if (next?.full) void window.uhub.news.article(next.item.url).catch(() => undefined)
  }

  private speak(i: number): void {
    const token = this.token
    const seg = this.segments[i]
    if (!seg) {
      // Track finished: a short breath, then the next one.
      this.patch({ status: 'loading' })
      setTimeout(() => {
        if (token !== this.token) return
        if (this.state.index + 1 < this.state.tracks.length) void this.startTrack(this.state.index + 1)
        else this.stop()
      }, 700)
      return
    }
    this.seg = i
    const u = new SpeechSynthesisUtterance(seg.text)
    const voice = pickVoice(this.lang, this.voiceURI)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? this.lang
    u.rate = this.rate
    u.onend = () => token === this.token && this.speak(i + 1)
    u.onerror = (e) => {
      if (token !== this.token || e.error === 'interrupted' || e.error === 'canceled') return
      this.speak(i + 1)
    }
    this.patch({ status: 'speaking', block: seg.block })
    speechSynthesis.speak(u)
  }

  /** Pausing cancels and remembers the segment: engines' native pause is unreliable with long gaps. */
  pause(): void {
    if (this.state.status !== 'speaking') return
    this.token++
    speechSynthesis.cancel()
    this.patch({ status: 'paused' })
  }

  resume(): void {
    if (this.state.status !== 'paused') return
    this.token++
    this.speak(this.seg)
  }

  toggle(): void {
    if (this.state.status === 'paused') this.resume()
    else this.pause()
  }

  next(): void {
    if (this.state.index + 1 < this.state.tracks.length) void this.startTrack(this.state.index + 1)
  }

  /** Back to the start of this news item, or to the previous one when already near its start. */
  prev(): void {
    if (this.seg > 1 || this.state.index === 0) this.restartAt(0)
    else void this.startTrack(this.state.index - 1)
  }

  /** Paragraphs (blocks) of the current item, in reading order. */
  private blocks(): number[] {
    return [...new Set(this.segments.map((s) => s.block))]
  }

  get canSkipBlock(): boolean {
    const b = this.blocks()
    return b.indexOf(this.state.block) < b.length - 1 || this.state.index + 1 < this.state.tracks.length
  }

  /** Next paragraph; past the last one, the next news item. */
  nextBlock(): void {
    const b = this.blocks()
    const target = b[b.indexOf(this.state.block) + 1]
    if (target === undefined) return this.next()
    this.restartAt(this.segments.findIndex((s) => s.block === target))
  }

  /** Start of this paragraph, or the previous one when already at its start. */
  prevBlock(): void {
    const b = this.blocks()
    const first = this.segments.findIndex((s) => s.block === this.state.block)
    const target = this.seg > first ? this.state.block : (b[b.indexOf(this.state.block) - 1] ?? b[0])
    this.restartAt(Math.max(0, this.segments.findIndex((s) => s.block === target)))
  }

  /** Jumps to a paragraph of the article being read. */
  seekBlock(block: number): void {
    const i = this.segments.findIndex((s) => s.block >= block)
    if (i >= 0) this.restartAt(i)
  }

  private restartAt(i: number): void {
    this.token++
    speechSynthesis.cancel()
    this.speak(i)
  }

  /** Speed and voice apply from the current sentence on. */
  configure(rate: number, voiceURI: string | null): void {
    const changed = rate !== this.rate || voiceURI !== this.voiceURI
    this.rate = rate
    this.voiceURI = voiceURI
    if (changed && this.state.status === 'speaking') this.restartAt(this.seg)
  }

  stop(): void {
    this.token++
    speechSynthesis.cancel()
    this.segments = []
    this.state = IDLE
    this.patch({})
  }
}

export const speech = new SpeechEngine()

export function useSpeech(): SpeechState {
  return useSyncExternalStore(speech.subscribe, speech.getSnapshot)
}
