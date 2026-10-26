import type { RadioState } from '@shared/types'
import { audioEngine } from './audioEngine'

let started = false

const snapshot = (): RadioState => {
  const s = audioEngine.getSnapshot()
  return {
    station: s.station && { id: s.station.id, name: s.station.name, genre: s.station.genre },
    playing: s.playing,
    loading: s.loading,
    error: s.error,
    volume: s.volume
  }
}

/** Plays the next/previous station in the user's list (wraps around); with nothing loaded, starts the first. */
async function skip(dir: 1 | -1): Promise<void> {
  const list = await window.uhub.store.get('stations')
  if (!list.length) return
  const current = audioEngine.getSnapshot().station
  const i = current ? list.findIndex((s) => s.id === current.id) : -1
  const next = i < 0 ? list[0] : list[(i + dir + list.length) % list.length]
  await audioEngine.play(next)
}

/**
 * Runs in the main window, which owns the <audio> element. Publishes every
 * radio state change to main (for the menu bar popover) and executes the
 * commands the popover sends back.
 */
export function startRadioBridge(): void {
  if (started) return
  started = true

  void window.uhub.store.get('volume').then((v) => audioEngine.setVolume(v))
  audioEngine.skip = (dir) => void skip(dir)

  let last = ''
  audioEngine.subscribe(() => {
    const s = snapshot()
    const key = JSON.stringify(s)
    if (key === last) return
    last = key
    window.uhub.radio.publish(s)
  })
  window.uhub.radio.publish(snapshot())

  window.uhub.radio.onCommand((cmd) => {
    // Reading news aloud: play/pause and skip act on the reading (volume still goes to the radio).
    const reading = audioEngine.mediaOverride
    if (reading && (cmd.type === 'toggle' || cmd.type === 'next' || cmd.type === 'prev')) {
      return cmd.type === 'toggle' ? reading.toggle() : cmd.type === 'next' ? reading.next() : reading.prev()
    }
    switch (cmd.type) {
      case 'toggle':
        if (audioEngine.getSnapshot().station) audioEngine.toggle()
        else void skip(1)
        break
      case 'next':
        void skip(1)
        break
      case 'prev':
        void skip(-1)
        break
      case 'stop':
        audioEngine.stop()
        break
      case 'volume':
        audioEngine.setVolume(cmd.value)
        void window.uhub.store.set('volume', cmd.value)
        break
    }
  })
}
