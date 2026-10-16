import { useEffect, useRef, useState } from 'react'

const THROTTLE_MS = 200
/** Give up waiting for Spotify to echo the new volume after this long. */
const HOLD_MAX_MS = 5000

/**
 * Optimistic volume for a Spotify device (0–100).
 *
 * Spotify's player state reports the old volume for a second or two after a
 * change, so showing `device.volume` right after a command makes the slider
 * snap back and then jump forward. The value the user picked is held on screen
 * until the device reports it (±1) or HOLD_MAX_MS passes.
 *
 * Requests are throttled: a click sends immediately, a drag sends at most every
 * THROTTLE_MS plus a final trailing value.
 */
export function useSpotifyVolume(devicePercent: number | null | undefined, send: (percent: number) => void): [number, (percent: number) => void] {
  const [held, setHeld] = useState<{ value: number; since: number } | null>(null)
  const lastSentAt = useRef(0)
  const lastSentValue = useRef<number | null>(null)
  const trailing = useRef<number | undefined>(undefined)
  const sendRef = useRef(send)
  sendRef.current = send

  // Release the hold once Spotify confirms the new value.
  useEffect(() => {
    if (held && devicePercent != null && Math.abs(devicePercent - held.value) <= 1) setHeld(null)
  }, [devicePercent, held])

  useEffect(() => () => window.clearTimeout(trailing.current), [])

  const fire = (v: number): void => {
    lastSentAt.current = Date.now()
    lastSentValue.current = v
    sendRef.current(v)
  }

  const change = (percent: number): void => {
    const v = Math.round(Math.min(100, Math.max(0, percent)))
    setHeld({ value: v, since: Date.now() })
    window.clearTimeout(trailing.current)
    if (Date.now() - lastSentAt.current >= THROTTLE_MS) fire(v)
    else trailing.current = window.setTimeout(() => lastSentValue.current !== v && fire(v), THROTTLE_MS)
  }

  const holding = held && Date.now() - held.since < HOLD_MAX_MS
  return [holding ? held.value : (devicePercent ?? 50), change]
}
