import type { ThemeAccent } from '@shared/types'

interface Palette {
  label: string
  500: string
  400: string
  200: string
  100: string
}

/** Values for the runtime "volt" tokens declared in styles.css. */
export const THEME: Record<ThemeAccent, Palette> = {
  violet: { label: 'Violeta', 500: '#8b5cf6', 400: '#a78bfa', 200: '#ddd6fe', 100: '#ede9fe' },
  indigo: { label: 'Índigo', 500: '#6366f1', 400: '#818cf8', 200: '#c7d2fe', 100: '#e0e7ff' },
  sky: { label: 'Ciano', 500: '#0ea5e9', 400: '#38bdf8', 200: '#bae6fd', 100: '#e0f2fe' },
  emerald: { label: 'Esmeralda', 500: '#10b981', 400: '#34d399', 200: '#a7f3d0', 100: '#d1fae5' },
  amber: { label: 'Âmbar', 500: '#f59e0b', 400: '#fbbf24', 200: '#fde68a', 100: '#fef3c7' },
  rose: { label: 'Rosa', 500: '#f43f5e', 400: '#fb7185', 200: '#fecdd3', 100: '#ffe4e6' }
}

export function applyTheme(accent: ThemeAccent, reduceMotion: boolean): void {
  const p = THEME[accent] ?? THEME.violet
  const root = document.documentElement.style
  root.setProperty('--color-volt', p[500])
  root.setProperty('--color-volt-soft', p[400])
  root.setProperty('--color-volt-200', p[200])
  root.setProperty('--color-volt-100', p[100])
  document.documentElement.classList.toggle('reduce-motion', reduceMotion)
}

/** `#rrggbb` + alpha → `rgba()`, for canvas/SVG code that can't use CSS variables. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
