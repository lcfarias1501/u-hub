import { ArrowDownToLine, Loader2, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/types'

export function UpdateBadge() {
  const [s, setS] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    void window.uhub.updater.status().then(setS)
    return window.uhub.updater.onStatus(setS)
  }, [])

  if (!s || s.state === 'idle') return null

  if (s.state === 'downloading') {
    return (
      <span className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
        <Loader2 className="size-3 animate-spin" /> v{s.version} {s.progress != null ? `${s.progress}%` : ''}
      </span>
    )
  }

  const ready = s.state === 'ready' && s.canInstall
  return (
    <button
      onClick={() => void window.uhub.updater.apply()}
      title={ready ? 'Reinicia o U-Hub com a nova versão' : 'Abre a página de download da nova versão'}
      className="animate-rise flex items-center gap-1.5 rounded-[3px] border border-volt/40 bg-volt/15 px-2 py-0.5 font-mono text-[10px] text-violet-100 transition-all hover:bg-volt/25 hover:shadow-[0_0_18px_-4px_var(--color-volt)]"
    >
      {ready ? <RotateCw className="size-3" /> : <ArrowDownToLine className="size-3" />}
      v{s.version} {ready ? '· reiniciar' : '· baixar'}
    </button>
  )
}
