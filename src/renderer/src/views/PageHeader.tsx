import type { ReactNode } from 'react'

export function PageHeader({ index, title, subtitle, children }: { index: string; title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="flex items-end gap-4 pb-5">
      <div>
        <div className="eyebrow mb-1 flex items-center gap-2">
          <span className="text-volt-soft">{index}</span>
          <span className="h-px w-8 bg-gradient-to-r from-volt/60 to-transparent" />
          {subtitle}
        </div>
        <h1 className="text-[26px] leading-none font-semibold tracking-tight text-zinc-50">{title}</h1>
      </div>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
