import { useEffect, useRef } from 'react'

export const isMac = window.uhub.platform === 'darwin'
export const MOD_LABEL = isMac ? '⌘' : 'Ctrl'

/** Binds `mod+<key>` shortcuts (⌘ on macOS, Ctrl elsewhere). Keys are matched case-insensitively. */
export function useModHotkeys(map: Record<string, () => void>): void {
  const ref = useRef(map)
  ref.current = map

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || e.altKey) return
      const fn = ref.current[e.key.toLowerCase()]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
