import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

export function CopyButton({ value, sensitive = false, label }: { value: string; sensitive?: boolean; label?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <button
      type="button"
      disabled={!value}
      title={sensitive ? 'Copiar (limpa do clipboard em 30s)' : 'Copiar'}
      onClick={async () => {
        await window.uhub.clipboard.copy(value, sensitive)
        setCopied(true)
      }}
      className={`relative inline-flex h-6 items-center gap-1 rounded-[3px] px-1.5 font-mono text-[10px] transition-all duration-150 active:scale-95 disabled:opacity-30 ${
        copied ? 'bg-acid/15 text-acid-soft' : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100'
      }`}
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span className={copied ? '' : label ? '' : 'sr-only'}>{copied ? 'Copiado!' : label}</span>
    </button>
  )
}
