import type { ReactNode } from 'react'

interface PanelProps {
  title?: string
  meta?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  /** Rendered before the title — e.g. a drag handle. */
  lead?: ReactNode
  className?: string
  bodyClassName?: string
  hover?: boolean
  children: ReactNode
}

export function Panel({ title, meta, icon, actions, lead, className = '', bodyClassName = '', hover = true, children }: PanelProps) {
  return (
    <section className={`panel ${hover ? 'panel-hover' : ''} flex flex-col ${className}`}>
      {title && (
        <header className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.05] px-3">
          {lead}
          {icon && <span className="text-volt-soft [&_svg]:size-3.5">{icon}</span>}
          <h2 className="eyebrow text-zinc-400">{title}</h2>
          {meta && <div className="ml-auto font-mono text-[11px] text-zinc-500">{meta}</div>}
          {actions && <div className={`${meta ? '' : 'ml-auto'} flex items-center gap-1`}>{actions}</div>}
        </header>
      )}
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}
