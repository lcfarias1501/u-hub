import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import type { StoreKey, StoreSchema } from '@shared/types'

/**
 * React state mirrored to electron-store. Writes are debounced so drag-and-drop
 * (which updates on every hover) doesn't hammer the disk.
 */
export function usePersistentState<K extends StoreKey>(
  key: K,
  fallback: StoreSchema[K]
): [StoreSchema[K], (action: SetStateAction<StoreSchema[K]>) => void, boolean] {
  const [value, setValue] = useState(fallback)
  const [ready, setReady] = useState(false)
  const ref = useRef(fallback)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let alive = true
    const load = (): void =>
      void window.uhub.store.get(key).then((v) => {
        if (!alive) return
        ref.current = v
        setValue(v)
        setReady(true)
      })
    load()
    // Values can also change outside this component (main process, other windows).
    // While a local write is still pending, ours is newer — skip the refetch.
    const off = window.uhub.store.onChanged((changed) => {
      if (changed === key && timer.current === undefined) load()
    })
    return () => {
      alive = false
      off()
    }
  }, [key])

  const set = useCallback(
    (action: SetStateAction<StoreSchema[K]>) => {
      const next =
        typeof action === 'function' ? (action as (prev: StoreSchema[K]) => StoreSchema[K])(ref.current) : action
      ref.current = next
      setValue(next)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        timer.current = undefined
        void window.uhub.store.set(key, ref.current)
      }, 250)
    },
    [key]
  )

  return [value, set, ready]
}
