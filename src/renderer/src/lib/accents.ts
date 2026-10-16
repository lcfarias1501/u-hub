import type { Accent } from '@shared/types'

interface AccentStyle {
  /** Chip / badge: text, background and border. */
  tone: string
  /** Larger surface, e.g. a launcher tile. */
  tile: string
  /** Neon glow on hover (applied via `group-hover`). */
  glow: string
  swatch: string
}

// Full class strings (not template-built) so Tailwind's scanner picks them up.
export const ACCENTS: Record<Accent, AccentStyle> = {
  violet: {
    tone: 'text-violet-300 bg-violet-500/10 border-violet-400/25',
    tile: 'text-violet-300 border-violet-400/20 bg-violet-500/[0.08]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#8b5cf6]',
    swatch: 'bg-violet-500'
  },
  indigo: {
    tone: 'text-indigo-300 bg-indigo-500/10 border-indigo-400/25',
    tile: 'text-indigo-300 border-indigo-400/20 bg-indigo-500/[0.08]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#6366f1]',
    swatch: 'bg-indigo-500'
  },
  blue: {
    tone: 'text-blue-300 bg-blue-500/10 border-blue-400/25',
    tile: 'text-blue-300 border-blue-400/20 bg-blue-500/[0.08]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#3b82f6]',
    swatch: 'bg-blue-500'
  },
  sky: {
    tone: 'text-sky-300 bg-sky-500/10 border-sky-400/25',
    tile: 'text-sky-300 border-sky-400/20 bg-sky-500/[0.08]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#0ea5e9]',
    swatch: 'bg-sky-500'
  },
  emerald: {
    tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-400/25',
    tile: 'text-emerald-300 border-emerald-400/20 bg-emerald-500/[0.08]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#10b981]',
    swatch: 'bg-emerald-500'
  },
  amber: {
    tone: 'text-amber-300 bg-amber-500/10 border-amber-400/25',
    tile: 'text-amber-300 border-amber-400/20 bg-amber-500/[0.08]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#f59e0b]',
    swatch: 'bg-amber-500'
  },
  rose: {
    tone: 'text-rose-300 bg-rose-500/10 border-rose-400/25',
    tile: 'text-rose-300 border-rose-400/20 bg-rose-500/[0.08]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#f43f5e]',
    swatch: 'bg-rose-500'
  },
  zinc: {
    tone: 'text-zinc-300 bg-white/5 border-white/15',
    tile: 'text-zinc-300 border-white/15 bg-white/[0.04]',
    glow: 'group-hover:shadow-[0_0_32px_-8px_#a1a1aa]',
    swatch: 'bg-zinc-400'
  }
}

export const ACCENT_KEYS = Object.keys(ACCENTS) as Accent[]
