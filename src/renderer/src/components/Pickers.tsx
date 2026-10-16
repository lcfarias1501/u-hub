import type { Accent } from '@shared/types'
import { ACCENTS, ACCENT_KEYS } from '@renderer/lib/accents'
import { ICONS } from '@renderer/lib/icons'

export function IconPicker({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(ICONS).map(([name, I]) => (
        <button
          type="button"
          key={name}
          onClick={() => onChange(name)}
          title={name}
          className={`grid size-8 place-items-center rounded-[3px] border transition-all duration-150 ${
            value === name ? 'border-volt/60 bg-volt/15 text-volt-200' : 'border-white/[0.06] text-zinc-500 hover:-translate-y-px hover:text-zinc-200'
          }`}
        >
          <I className="size-4" />
        </button>
      ))}
    </div>
  )
}

export function AccentPicker({ value, onChange }: { value: Accent; onChange: (a: Accent) => void }) {
  return (
    <div className="flex gap-2">
      {ACCENT_KEYS.map((a) => (
        <button
          type="button"
          key={a}
          onClick={() => onChange(a)}
          className={`size-6 rounded-[3px] ${ACCENTS[a].swatch} transition-all ${value === a ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-raised' : 'opacity-50 hover:opacity-100'}`}
          aria-label={a}
        />
      ))}
    </div>
  )
}
