import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, type AppSettings, type ModuleId } from '@shared/types'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { THEME, applyTheme } from './theme'

interface SettingsCtx {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  ready: boolean
  /** Visible modules in sidebar order. */
  modules: ModuleId[]
  /** Hex of the current accent, for charts and canvas. */
  volt: string
}

const Ctx = createContext<SettingsCtx | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [stored, setStored, ready] = usePersistentState('settings', DEFAULT_SETTINGS)
  // Merge over defaults so settings added in later versions are always present.
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored])
  const update = useCallback((patch: Partial<AppSettings>) => setStored((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch })), [setStored])

  useEffect(() => {
    if (ready) applyTheme(settings.accent, settings.reduceMotion)
  }, [ready, settings.accent, settings.reduceMotion])

  const value = useMemo<SettingsCtx>(() => {
    const visible = settings.modules.filter((m) => m.visible).map((m) => m.id)
    return {
      settings,
      update,
      ready,
      modules: visible.length ? visible : ['performance'],
      volt: (THEME[settings.accent] ?? THEME.violet)[500]
    }
  }, [settings, update, ready])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
