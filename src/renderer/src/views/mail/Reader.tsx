import { Archive, Check, Copy, Download, Forward, ImageOff, KeyRound, Loader2, MailOpen, Paperclip, Reply, ReplyAll, Star, Tag, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MailCategory, MailMessage, VaultEntry } from '@shared/types'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { ACCENTS } from '@renderer/lib/accents'
import { uid } from '@renderer/lib/format'
import { iconFor } from '@renderer/lib/icons'

const fmtSize = (n: number): string => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const who = (a: { name: string; address: string }): string => (a.name ? `${a.name} <${a.address}>` : a.address)

/**
 * The message body is rendered in a sandboxed iframe: no scripts, no same-origin
 * access, links open in the system browser. Remote images (tracking pixels) are
 * blocked by CSP until the user allows them for this message or sender.
 */
function buildDoc(html: string, allowRemote: boolean): string {
  const csp = `default-src 'none'; img-src data: cid:${allowRemote ? ' https: http:' : ''}; style-src 'unsafe-inline'${allowRemote ? ' https:' : ''}; font-src data:${allowRemote ? ' https:' : ''}`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;padding:20px;font:14px/1.5 -apple-system,system-ui,sans-serif;color:#18181b;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}pre{white-space:pre-wrap}</style></head><body>${html}</body></html>`
}

const escapeHtml = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const textToHtml = (t: string): string =>
  `<pre style="font:14px/1.6 -apple-system,system-ui,sans-serif">${escapeHtml(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</pre>`

export function Reader({
  msg,
  loading,
  categories,
  categoryIds,
  onReply,
  onForward,
  onArchive,
  onTrash,
  onToggleFlag,
  onMarkUnread,
  onQuickRule
}: {
  msg: MailMessage | null
  loading: boolean
  categories: MailCategory[]
  categoryIds: string[]
  onReply: (all: boolean) => void
  onForward: () => void
  onArchive: () => void
  onTrash: () => void
  onToggleFlag: () => void
  onMarkUnread: () => void
  onQuickRule: (categoryId: string) => void
}) {
  const [trusted, setTrusted] = usePersistentState('mailTrustedSenders', [])
  const [showImages, setShowImages] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState<string[]>([])
  const [catMenu, setCatMenu] = useState(false)

  const sender = msg?.from.address.toLowerCase() ?? ''
  const allowRemote = showImages || trusted.includes(sender)
  const doc = useMemo(() => (msg ? buildDoc(msg.html ?? textToHtml(msg.text), allowRemote) : ''), [msg, allowRemote])

  if (loading)
    return (
      <div className="grid h-full place-items-center text-zinc-500">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  if (!msg)
    return (
      <div className="grid h-full place-items-center text-center text-[12px] text-zinc-600">
        <div>
          <MailOpen className="mx-auto mb-2 size-8 text-zinc-700" strokeWidth={1.25} />
          Selecione um e-mail para ler
        </div>
      </div>
    )

  const copy = async (code: string): Promise<void> => {
    await window.uhub.clipboard.copy(code, true)
    setCopied(code)
    setTimeout(() => setCopied(null), 1500)
  }

  const saveKey = async (key: string): Promise<void> => {
    const { entries, error } = await window.uhub.vault.read()
    if (error) return alert(`${error}\n\nAbra o Vault para resolver antes de salvar keys.`)
    const from = msg.from.address.toLowerCase()
    const category = from.includes('steam') ? 'steam' : from.includes('battle.net') || from.includes('blizzard') ? 'battlenet' : 'other'
    const entry: VaultEntry = {
      id: uid(),
      category,
      title: msg.subject.slice(0, 80) || 'Key de jogo',
      username: '',
      secret: key,
      host: '',
      notes: `Recebida de ${msg.from.name || msg.from.address} em ${new Date(msg.date).toLocaleDateString('pt-BR')}`,
      updatedAt: Date.now()
    }
    await window.uhub.vault.write([entry, ...entries])
    setSavedKeys((k) => [...k, key])
  }

  const mine = categories.filter((c) => categoryIds.includes(c.id))

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-white/[0.06] px-3 py-2">
        <button className="btn h-8" onClick={() => onReply(false)}>
          <Reply className="size-3.5" /> Responder
        </button>
        <button className="icon-btn size-8" title="Responder a todos" onClick={() => onReply(true)}>
          <ReplyAll className="size-4" />
        </button>
        <button className="icon-btn size-8" title="Encaminhar" onClick={onForward}>
          <Forward className="size-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-white/[0.08]" />
        <button className="icon-btn size-8" title="Arquivar" onClick={onArchive}>
          <Archive className="size-4" />
        </button>
        <button className="icon-btn size-8 hover:!text-rose-300" title="Excluir" onClick={onTrash}>
          <Trash2 className="size-4" />
        </button>
        <button className="icon-btn size-8" title="Marcar como não lido" onClick={onMarkUnread}>
          <MailOpen className="size-4" />
        </button>
        <button className={`icon-btn size-8 ${msg.flagged ? '!text-amber-300' : ''}`} title="Estrela" onClick={onToggleFlag}>
          <Star className="size-4" fill={msg.flagged ? 'currentColor' : 'none'} />
        </button>
        <div className="relative ml-auto">
          <button className="btn h-8" onClick={() => setCatMenu((v) => !v)}>
            <Tag className="size-3.5" /> Categorizar
          </button>
          {catMenu && (
            <div className="panel animate-rise absolute top-9 right-0 z-30 w-72 !bg-raised/95 p-1" onMouseLeave={() => setCatMenu(false)}>
              <div className="px-2 py-1.5 text-[11px] text-zinc-500">Sempre colocar e-mails de <span className="text-zinc-300">{msg.from.address}</span> em:</div>
              {categories.map((c) => {
                const Icon = iconFor(c.icon)
                const on = categoryIds.includes(c.id)
                return (
                  <button
                    key={c.id}
                    disabled={on}
                    onClick={() => {
                      onQuickRule(c.id)
                      setCatMenu(false)
                    }}
                    className="flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[12px] text-zinc-300 hover:bg-white/[0.06] disabled:opacity-50"
                  >
                    <Icon className={`size-3.5 ${ACCENTS[c.accent].tone.split(' ')[0]}`} /> {c.name}
                    {on && <Check className="ml-auto size-3.5 text-acid" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Header */}
        <div className="space-y-2 px-5 pt-4 pb-3">
          <h2 className="text-[18px] leading-snug font-semibold text-zinc-50">{msg.subject || '(sem assunto)'}</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            {mine.map((c) => {
              const Icon = iconFor(c.icon)
              return (
                <span key={c.id} className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] ${ACCENTS[c.accent].tone}`}>
                  <Icon className="size-3" /> {c.name}
                </span>
              )
            })}
          </div>
          <div className="text-[12px] text-zinc-400">
            <span className="text-zinc-200">{who(msg.from)}</span>
            <span className="text-zinc-600"> · {new Date(msg.date).toLocaleString('pt-BR')}</span>
          </div>
          <div className="truncate text-[11px] text-zinc-500">
            para {msg.to.map(who).join(', ')}
            {msg.cc.length > 0 && ` · cc ${msg.cc.map(who).join(', ')}`}
          </div>
        </div>

        {/* Smart extras */}
        {(msg.codes.length > 0 || msg.gameKeys.length > 0) && (
          <div className="mx-5 mb-3 space-y-2">
            {msg.codes.map((c) => (
              <div key={c} className="flex items-center gap-3 rounded-[4px] border border-acid/30 bg-acid/[0.07] px-3 py-2">
                <span className="text-[12px] text-zinc-400">Código encontrado</span>
                <code className="font-mono text-[18px] tracking-[0.2em] text-emerald-100">{c}</code>
                <button className="btn ml-auto h-8 !border-acid/40 !text-emerald-200" onClick={() => void copy(c)}>
                  {copied === c ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === c ? 'Copiado!' : 'Copiar código'}
                </button>
              </div>
            ))}
            {msg.gameKeys.map((k) => (
              <div key={k} className="flex items-center gap-3 rounded-[4px] border border-volt/30 bg-volt/[0.07] px-3 py-2">
                <KeyRound className="size-4 text-volt-soft" />
                <code className="font-mono text-[14px] tracking-wider text-volt-100 select-text">{k}</code>
                <button className="icon-btn ml-auto" title="Copiar key" onClick={() => void copy(k)}>
                  {copied === k ? <Check className="size-3.5 text-acid" /> : <Copy className="size-3.5" />}
                </button>
                <button className="btn h-8" disabled={savedKeys.includes(k)} onClick={() => void saveKey(k)}>
                  {savedKeys.includes(k) ? <Check className="size-3.5" /> : <KeyRound className="size-3.5" />} {savedKeys.includes(k) ? 'Salva no Vault' : 'Salvar no Vault'}
                </button>
              </div>
            ))}
          </div>
        )}

        {msg.remoteImages && !allowRemote && (
          <div className="mx-5 mb-3 flex items-center gap-3 rounded-[3px] border border-white/[0.07] bg-black/20 px-3 py-2 text-[12px] text-zinc-400">
            <ImageOff className="size-4 shrink-0" /> Imagens externas bloqueadas (podem avisar o remetente que você abriu).
            <button className="ml-auto text-volt-soft hover:underline" onClick={() => setShowImages(true)}>
              Mostrar
            </button>
            <button className="text-volt-soft hover:underline" onClick={() => setTrusted([...trusted, sender])}>
              Sempre deste remetente
            </button>
          </div>
        )}

        <iframe
          title="Conteúdo do e-mail"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={doc}
          className="mx-5 mb-4 block h-[60vh] w-[calc(100%-2.5rem)] rounded-[4px] bg-white"
        />

        {msg.attachments.length > 0 && (
          <div className="mx-5 mb-6">
            <div className="eyebrow mb-2 flex items-center gap-1.5">
              <Paperclip className="size-3" /> Anexos · {msg.attachments.length}
            </div>
            <div className="flex flex-wrap gap-2">
              {msg.attachments.map((a) => (
                <button
                  key={a.index}
                  className="flex items-center gap-2 rounded-[3px] border border-white/[0.07] bg-black/20 px-3 py-2 text-left transition-colors hover:border-volt/40"
                  onClick={() => void window.uhub.mail.saveAttachment(msg.accountId, msg.folder, msg.uid, a.index)}
                >
                  <Download className="size-3.5 text-zinc-500" />
                  <span className="max-w-[220px] truncate text-[12px] text-zinc-200">{a.filename}</span>
                  <span className="font-mono text-[10px] text-zinc-600">{fmtSize(a.size)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
