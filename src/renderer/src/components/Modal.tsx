import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Modal({ title, onClose, children, width = 'max-w-lg' }: { title: string; onClose: () => void; children: ReactNode; width?: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onMouseDown={onClose}>
      <div className={`panel animate-rise w-full ${width} !bg-raised/95`} onMouseDown={(e) => e.stopPropagation()}>
        <header className="flex h-11 items-center border-b border-white/[0.06] px-4">
          <h2 className="eyebrow text-zinc-300">{title}</h2>
          <button className="icon-btn ml-auto" onClick={onClose} aria-label="Fechar">
            <X className="size-4" />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="font-mono text-[10px] text-zinc-600">{hint}</span>}
    </label>
  )
}
