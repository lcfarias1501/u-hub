import type { ReactNode } from 'react'

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-35 ${
        checked ? 'border-volt/60 bg-volt/40' : 'border-white/10 bg-white/[0.06]'
      }`}
    >
      <span
        className={`absolute top-1/2 left-0.5 size-3.5 -translate-y-1/2 rounded-full transition-all duration-200 ease-(--ease-snap) ${
          checked ? 'translate-x-4 bg-white shadow-[0_0_10px_var(--color-volt)]' : 'bg-zinc-500'
        }`}
      />
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-[3px] border border-white/[0.08] p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-[2px] px-2.5 py-1 font-mono text-[11px] transition-colors ${
            value === o.value ? 'bg-volt/25 text-volt-100' : 'text-zinc-500 hover:text-zinc-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** One labelled setting: text on the left, control on the right. */
export function SettingRow({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-6 py-3.5 first:pt-1 last:pb-1">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-zinc-200">{title}</div>
        {description && <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}
