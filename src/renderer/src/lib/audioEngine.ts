import { useSyncExternalStore } from 'react'
import type { RadioStation } from '@shared/types'
import logo from '@renderer/assets/logo.png'

interface AudioState {
  station: RadioStation | null
  playing: boolean
  loading: boolean
  error: string | null
  volume: number
}

/**
 * One audio element for the whole app, so the radio keeps playing while the
 * user is on other tabs. Graph: element → analyser → gain → speakers; the
 * analyser sits before the gain so the visualizer still moves at low volume.
 */
class AudioEngine {
  private el = new Audio()
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  analyser: AnalyserNode | null = null
  private state: AudioState = { station: null, playing: false, loading: false, error: null, volume: 0.6 }
  private listeners = new Set<() => void>()
  /** Station skipping needs the station list, which the radio bridge provides. */
  skip: ((dir: 1 | -1) => void) | null = null

  constructor() {
    this.el.crossOrigin = 'anonymous'
    this.el.preload = 'none'
    this.el.addEventListener('playing', () => this.patch({ playing: true, loading: false, error: null }))
    this.el.addEventListener('waiting', () => this.patch({ loading: true }))
    this.el.addEventListener('pause', () => this.patch({ playing: false, loading: false }))
    this.el.addEventListener('error', () => {
      if (!this.el.getAttribute('src')) return
      this.patch({ playing: false, loading: false, error: 'Stream indisponível' })
    })

    // macOS "Now Playing" / Windows media overlay and the keyboard media keys.
    const ms = navigator.mediaSession
    ms.setActionHandler('play', () => this.state.station && void this.play(this.state.station))
    ms.setActionHandler('pause', () => this.pause())
    ms.setActionHandler('stop', () => this.stop())
    ms.setActionHandler('nexttrack', () => this.skip?.(1))
    ms.setActionHandler('previoustrack', () => this.skip?.(-1))
  }

  private patch(p: Partial<AudioState>): void {
    this.state = { ...this.state, ...p }
    navigator.mediaSession.playbackState = this.state.playing ? 'playing' : this.state.station ? 'paused' : 'none'
    this.listeners.forEach((l) => l())
  }

  private describe(station: RadioStation): void {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: station.name,
      artist: station.genre,
      album: 'U-Hub Radio',
      artwork: [{ src: new URL(logo, location.href).href, sizes: '256x256', type: 'image/png' }]
    })
  }

  private ensureGraph(): void {
    if (this.ctx) return
    this.ctx = new AudioContext()
    const src = this.ctx.createMediaElementSource(this.el)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 256
    this.analyser.smoothingTimeConstant = 0.78
    this.gain = this.ctx.createGain()
    this.gain.gain.value = this.state.volume
    src.connect(this.analyser).connect(this.gain).connect(this.ctx.destination)
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  getSnapshot = (): AudioState => this.state

  async play(station: RadioStation): Promise<void> {
    this.ensureGraph()
    await this.ctx!.resume()
    if (this.state.station?.id !== station.id || !this.el.getAttribute('src')) {
      this.el.src = station.url
    }
    this.patch({ station, loading: true, error: null })
    this.describe(station)
    try {
      await this.el.play()
    } catch (err) {
      // A newer play()/stop() interrupting this one is not a failure.
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.warn('[audio] play failed', String(err), this.el.error?.message)
      this.patch({ loading: false, playing: false, error: 'Falha ao iniciar o stream — servidor recusou ou está offline' })
    }
  }

  pause(): void {
    this.el.pause()
  }

  /** Drops the connection entirely; live streams would otherwise keep buffering. */
  stop(): void {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    this.patch({ playing: false, loading: false })
  }

  toggle(): void {
    if (this.state.playing) this.pause()
    else if (this.state.station) void this.play(this.state.station)
  }

  setVolume(v: number): void {
    const volume = Math.min(1, Math.max(0, v))
    if (this.gain) this.gain.gain.value = volume
    this.patch({ volume })
  }
}

export const audioEngine = new AudioEngine()

export function useAudio(): AudioState {
  return useSyncExternalStore(audioEngine.subscribe, audioEngine.getSnapshot)
}
