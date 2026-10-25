import { Archive, ChevronDown, ChevronRight, Copy, Inbox, Loader2, Mail, Paperclip, PenSquare, Plus, RefreshCw, Search, Send, Settings2, ShieldAlert, Star, Trash2, FileText, Check, Folder } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { categorize, type MailAccount, type MailAccountStatus, type MailDraft, type MailFolder, type MailMessage, type MailSummary } from '@shared/types'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { ACCENTS } from '@renderer/lib/accents'
import { uid } from '@renderer/lib/format'
import { iconFor } from '@renderer/lib/icons'
import { AccountSetup } from './AccountSetup'
import { CategoriesManager } from './Categories'
import { Compose } from './Compose'
import { Reader } from './Reader'

type Selection = { kind: 'folder'; accountId: string; folder: string; name: string } | { kind: 'category'; id: string }

const FOLDER_ICON: Record<string, typeof Inbox> = {
  '\\Inbox': Inbox,
  '\\Sent': Send,
  '\\Drafts': FileText,
  '\\Archive': Archive,
  '\\All': Archive,
  '\\Junk': ShieldAlert,
  '\\Trash': Trash2,
  '\\Flagged': Star
}
const MAIN_FOLDERS = new Set(['\\Inbox', '\\Flagged', '\\Sent', '\\Drafts', '\\Archive', '\\All', '\\Junk', '\\Trash'])

function when(t: number): string {
  const d = new Date(t)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (now.getTime() - t < 6 * 86_400_000) return d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

const quote = (m: MailMessage): string =>
  `\n\nEm ${new Date(m.date).toLocaleString('pt-BR')}, ${m.from.name || m.from.address} escreveu:\n${m.text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')}`

const addrString = (list: { name: string; address: string }[]): string => list.map((a) => a.address).filter(Boolean).join(', ')

/** Live unread total across accounts, for the sidebar badge. */
export function useMailUnread(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const sum = (s: MailAccountStatus[]): void => setN(s.reduce((a, x) => a + (x.unread || 0), 0))
    void window.uhub.mail.status().then(sum)
    return window.uhub.mail.onStatus(sum)
  }, [])
  return n
}

export function MailView() {
  const [accounts, , accountsReady] = usePersistentState('mailAccounts', [])
  const [categories, setCategories] = usePersistentState('mailCategories', [])
  const [rules, setRules] = usePersistentState('mailRules', [])
  const [statuses, setStatuses] = useState<MailAccountStatus[]>([])
  const [folders, setFolders] = useState<Record<string, MailFolder[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [sel, setSel] = useState<Selection | null>(null)
  const [items, setItems] = useState<MailSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [open, setOpen] = useState<MailMessage | null>(null)
  const [openLoading, setOpenLoading] = useState(false)
  const [setup, setSetup] = useState<MailAccount | 'new' | null>(null)
  const [draft, setDraft] = useState<MailDraft | null>(null)
  const [managing, setManaging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const req = useRef(0)
  /** Last list per folder/category: switching back shows it instantly while it refreshes. */
  const cache = useRef(new Map<string, { items: MailSummary[]; total: number }>())
  const selKey = (s: Selection | null): string => (!s ? '' : s.kind === 'category' ? `cat:${s.id}` : `${s.accountId}|${s.folder}`)

  useEffect(() => {
    void window.uhub.mail.status().then(setStatuses)
    return window.uhub.mail.onStatus(setStatuses)
  }, [])

  // Default selection: first account's inbox.
  useEffect(() => {
    if (!sel && accounts[0]) setSel({ kind: 'folder', accountId: accounts[0].id, folder: 'INBOX', name: 'Entrada' })
    if (sel?.kind === 'folder' && !accounts.some((a) => a.id === sel.accountId)) setSel(null)
  }, [accounts, sel])

  const loadFolders = useCallback(async (id: string) => {
    try {
      const f = await window.uhub.mail.folders(id)
      setFolders((x) => ({ ...x, [id]: f }))
    } catch {
      /* status shows the error */
    }
  }, [])

  useEffect(() => {
    for (const a of accounts) if (statuses.find((s) => s.id === a.id)?.state === 'online' && !folders[a.id]) void loadFolders(a.id)
  }, [accounts, statuses, folders, loadFolders])

  const load = useCallback(
    async (p = 0) => {
      if (!sel) return
      const n = ++req.current
      setListLoading(true)
      setListError(null)
      try {
        if (sel.kind === 'folder') {
          const r = await window.uhub.mail.list(sel.accountId, sel.folder, p, query)
          if (n !== req.current) return
          setItems((prev) => {
            // Keep previews we already had for the same messages until fresh ones arrive.
            const known = new Map(prev.map((m) => [`${m.accountId}:${m.uid}`, m]))
            const merged = r.items.map((m) => {
              const k = known.get(`${m.accountId}:${m.uid}`)
              return k && !m.snippet ? { ...m, snippet: k.snippet, code: k.code } : m
            })
            const next = p === 0 ? merged : [...prev, ...merged]
            if (!query.trim()) cache.current.set(selKey(sel), { items: next, total: r.total })
            return next
          })
          setTotal(r.total)
        } else {
          const r = await window.uhub.mail.category(sel.id)
          if (n !== req.current) return
          const q = query.trim().toLowerCase()
          const filtered = q ? r.filter((m) => `${m.from.name} ${m.from.address} ${m.subject}`.toLowerCase().includes(q)) : r
          setItems(filtered)
          setTotal(filtered.length)
          if (!q) cache.current.set(selKey(sel), { items: filtered, total: filtered.length })
        }
        setPage(p)
      } catch (e) {
        if (n === req.current) setListError((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      } finally {
        if (n === req.current) setListLoading(false)
      }
    },
    [sel, query]
  )

  useEffect(() => {
    setOpen(null)
    const cached = cache.current.get(selKey(sel))
    setItems(cached?.items ?? [])
    setTotal(cached?.total ?? 0)
    void load(0)
  }, [sel])

  // Search: debounce typing.
  useEffect(() => {
    const t = setTimeout(() => void load(0), 400)
    return () => clearTimeout(t)
  }, [query])

  // Snippets and codes arrive after the list (fetched in the background).
  useEffect(
    () =>
      window.uhub.mail.onPreviews((batch) => {
        const map = new Map(batch.map((b) => [`${b.accountId}:${b.folder}:${b.uid}`, b]))
        const patch = (list: MailSummary[]): MailSummary[] =>
          list.map((m) => {
            const b = map.get(`${m.accountId}:${m.folder}:${m.uid}`)
            return b ? { ...m, snippet: b.snippet, code: b.code } : m
          })
        setItems(patch)
        for (const [k, v] of cache.current) cache.current.set(k, { ...v, items: patch(v.items) })
      }),
    []
  )

  // New mail arrives live (IMAP IDLE).
  useEffect(
    () =>
      window.uhub.mail.onNew((fresh) => {
        if (!sel) return
        const relevant =
          sel.kind === 'folder'
            ? fresh.filter((m) => m.accountId === sel.accountId && sel.folder.toUpperCase() === 'INBOX')
            : fresh.filter((m) => categorize(m, rules.filter((r) => r.categoryId === sel.id)).length)
        if (relevant.length) setItems((prev) => [...relevant, ...prev.filter((p) => !relevant.some((r) => r.uid === p.uid && r.accountId === p.accountId))])
      }),
    [sel, rules]
  )

  const flash = (t: string): void => {
    setToast(t)
    setTimeout(() => setToast(null), 2200)
  }

  const openMsg = async (m: MailSummary): Promise<void> => {
    setOpenLoading(true)
    try {
      const full = await window.uhub.mail.open(m.accountId, m.folder, m.uid)
      setOpen(full)
      setItems((prev) => prev.map((x) => (x.uid === m.uid && x.accountId === m.accountId ? { ...x, seen: true } : x)))
    } catch (e) {
      flash((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    } finally {
      setOpenLoading(false)
    }
  }

  const removeFromList = (m: MailSummary): void => {
    setItems((prev) => prev.filter((x) => !(x.uid === m.uid && x.accountId === m.accountId)))
    setOpen(null)
  }

  const contacts = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of items) if (m.from.address) seen.set(m.from.address.toLowerCase(), m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address)
    return [...seen.values()].slice(0, 200)
  }, [items])

  const newDraft = (patch: Partial<MailDraft> = {}): MailDraft => ({
    accountId: (sel?.kind === 'folder' ? sel.accountId : accounts[0]?.id) ?? '',
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: [],
    ...patch
  })

  const reply = (all: boolean): void => {
    if (!open) return
    const me = accounts.find((a) => a.id === open.accountId)?.email.toLowerCase()
    const primary = open.replyTo.length ? open.replyTo : [open.from]
    const others = all ? [...open.to, ...open.cc].filter((a) => a.address.toLowerCase() !== me && !primary.some((p) => p.address === a.address)) : []
    setDraft(
      newDraft({
        accountId: open.accountId,
        to: addrString(primary),
        cc: addrString(others),
        subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`,
        body: quote(open),
        inReplyTo: open.messageId,
        references: [...open.references, ...(open.messageId ? [open.messageId] : [])]
      })
    )
  }

  const forward = (): void => {
    if (!open) return
    setDraft(
      newDraft({
        accountId: open.accountId,
        subject: /^fwd?:/i.test(open.subject) ? open.subject : `Fwd: ${open.subject}`,
        body: `\n\n---------- Mensagem encaminhada ----------\nDe: ${open.from.name} <${open.from.address}>\nData: ${new Date(open.date).toLocaleString('pt-BR')}\nAssunto: ${open.subject}\nPara: ${addrString(open.to)}\n\n${open.text}`
      })
    )
  }

  if (!accountsReady) return null

  if (!accounts.length) {
    return (
      <div className="animate-rise grid h-full place-items-center p-6">
        <div className="panel max-w-lg px-10 py-12 text-center">
          <Mail className="mx-auto mb-4 size-10 text-volt-soft" strokeWidth={1.4} />
          <h2 className="text-[22px] font-semibold text-zinc-50">Seus e-mails no U-Hub</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
            Conecte Gmail, iCloud, Yahoo ou qualquer conta IMAP. Organize por categorias com regras automáticas, copie códigos de verificação com um clique e salve keys de jogos direto no Vault.
          </p>
          <p className="mt-2 text-[11px] text-zinc-600">Sua senha fica criptografada neste computador e nunca vai para a nuvem.</p>
          <button className="btn btn-volt mt-6 h-10 px-5" onClick={() => setSetup('new')}>
            <Plus className="size-4" /> Adicionar conta de e-mail
          </button>
        </div>
        {setup && <AccountSetup initial={null} onClose={() => setSetup(null)} onSaved={() => setSetup(null)} />}
      </div>
    )
  }

  const title = sel?.kind === 'category' ? (categories.find((c) => c.id === sel.id)?.name ?? 'Categoria') : (sel?.name ?? '')
  const isSel = (s: Selection): boolean =>
    !!sel && sel.kind === s.kind && (s.kind === 'category' ? sel.kind === 'category' && sel.id === s.id : sel.kind === 'folder' && sel.accountId === s.accountId && sel.folder === s.folder)

  return (
    <div className="grid h-full grid-cols-[230px_380px_minmax(0,1fr)]">
      {/* ── Left: compose, categories, accounts ── */}
      <aside className="flex min-h-0 flex-col border-r border-white/[0.06] bg-void/40">
        <div className="p-3">
          <button className="btn btn-volt h-10 w-full justify-center" onClick={() => setDraft(newDraft())}>
            <PenSquare className="size-4" /> Escrever
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <SideTitle action={<button className="icon-btn size-6" title="Gerenciar categorias" onClick={() => setManaging(true)}><Settings2 className="size-3.5" /></button>}>
            Categorias
          </SideTitle>
          {categories.map((c) => {
            const Icon = iconFor(c.icon)
            return (
              <SideItem key={c.id} active={isSel({ kind: 'category', id: c.id })} onClick={() => setSel({ kind: 'category', id: c.id })} icon={<Icon className={`size-4 ${ACCENTS[c.accent].tone.split(' ')[0]}`} />}>
                {c.name}
              </SideItem>
            )
          })}

          {accounts.map((a) => {
            const st = statuses.find((s) => s.id === a.id)
            const list = folders[a.id] ?? []
            const main = list.filter((f) => MAIN_FOLDERS.has(f.specialUse ?? ''))
            const rest = list.filter((f) => !MAIN_FOLDERS.has(f.specialUse ?? ''))
            return (
              <div key={a.id} className="mt-4">
                <SideTitle
                  action={
                    <button className="icon-btn size-6" title="Editar conta" onClick={() => setSetup(a)}>
                      <Settings2 className="size-3.5" />
                    </button>
                  }
                >
                  <span className={`size-1.5 rounded-full ${st?.state === 'online' ? 'bg-acid' : st?.state === 'error' ? 'bg-crit' : 'bg-warn animate-pulse-dot'}`} />
                  <span className={`truncate normal-case ${ACCENTS[a.accent].tone.split(' ')[0]}`}>{a.email}</span>
                </SideTitle>
                {st?.state === 'error' && <p className="px-2 pb-1 text-[10px] leading-snug text-rose-300">{st.error}</p>}
                {(main.length ? main : [{ path: 'INBOX', name: 'Entrada', specialUse: '\\Inbox', unread: st?.unread ?? null }]).map((f) => {
                  const Icon = FOLDER_ICON[f.specialUse ?? ''] ?? Folder
                  return (
                    <SideItem
                      key={f.path}
                      active={isSel({ kind: 'folder', accountId: a.id, folder: f.path, name: f.name })}
                      onClick={() => setSel({ kind: 'folder', accountId: a.id, folder: f.path, name: f.name })}
                      icon={<Icon className="size-4" />}
                      count={f.specialUse === '\\Inbox' ? (st?.unread ?? f.unread) : f.specialUse === '\\Junk' ? null : f.unread}
                    >
                      {f.name}
                    </SideItem>
                  )
                })}
                {rest.length > 0 && (
                  <>
                    <button className="flex w-full items-center gap-1 px-2 py-1 font-mono text-[10px] text-zinc-600 hover:text-zinc-300" onClick={() => setExpanded((x) => ({ ...x, [a.id]: !x[a.id] }))}>
                      {expanded[a.id] ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />} Outras pastas ({rest.length})
                    </button>
                    {expanded[a.id] &&
                      rest.map((f) => (
                        <SideItem key={f.path} active={isSel({ kind: 'folder', accountId: a.id, folder: f.path, name: f.name })} onClick={() => setSel({ kind: 'folder', accountId: a.id, folder: f.path, name: f.name })} icon={<Folder className="size-4" />} count={f.unread}>
                          {f.name}
                        </SideItem>
                      ))}
                  </>
                )}
              </div>
            )
          })}
          <button className="btn mt-4 w-full justify-center border-dashed" onClick={() => setSetup('new')}>
            <Plus className="size-3.5" /> Adicionar conta
          </button>
        </div>
      </aside>

      {/* ── Middle: message list ── */}
      <section className="flex min-h-0 flex-col border-r border-white/[0.06]">
        <div className="relative space-y-2 border-b border-white/[0.06] p-3">
          {/* Indeterminate progress while the list loads or refreshes. */}
          {listLoading && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden">
              <span className="absolute inset-y-0 w-1/3 animate-[mail-progress_1.1s_ease-in-out_infinite] bg-volt shadow-[0_0_8px_var(--color-volt)]" />
              <style>{'@keyframes mail-progress{0%{left:-33%}100%{left:100%}}'}</style>
            </span>
          )}
          <div className="flex items-center gap-2">
            <h2 className="flex-1 truncate text-[15px] font-semibold text-zinc-100">{title}</h2>
            <span className="font-mono text-[10px] text-zinc-600">{total}</span>
            <button className="icon-btn" title="Atualizar" onClick={() => void load(0)}>
              {listLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
            <input className="field h-8 pl-9" placeholder="Buscar remetente ou assunto…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {listError ? (
            <p className="p-4 text-[12px] text-rose-300">{listError}</p>
          ) : !items.length && listLoading ? (
            Array.from({ length: 9 }, (_, i) => <SkeletonRow key={i} />)
          ) : !items.length ? (
            <p className="p-8 text-center text-[12px] text-zinc-600">{sel?.kind === 'category' ? 'Nenhum e-mail recente nesta categoria.' : 'Nada por aqui.'}</p>
          ) : (
            items.map((m) => (
              <MailRow
                key={`${m.accountId}:${m.folder}:${m.uid}`}
                m={m}
                active={open?.uid === m.uid && open.accountId === m.accountId}
                cats={categories.filter((c) => categorize(m, rules.filter((r) => r.categoryId === c.id)).length)}
                showAccount={sel?.kind === 'category' && accounts.length > 1 ? accounts.find((a) => a.id === m.accountId) : undefined}
                onOpen={() => void openMsg(m)}
                onCopied={() => flash('Código copiado')}
              />
            ))
          )}
          {sel?.kind === 'folder' && items.length < total && (
            <button className="btn m-3 w-[calc(100%-1.5rem)] justify-center" disabled={listLoading} onClick={() => void load(page + 1)}>
              {listLoading ? <Loader2 className="size-3.5 animate-spin" /> : null} Carregar mais
            </button>
          )}
        </div>
      </section>

      {/* ── Right: reader ── */}
      <section className="relative min-h-0">
        <Reader
          msg={open}
          loading={openLoading}
          categories={categories}
          categoryIds={open ? categories.filter((c) => categorize(open, rules.filter((r) => r.categoryId === c.id)).length).map((c) => c.id) : []}
          onReply={reply}
          onForward={forward}
          onArchive={async () => {
            if (!open) return
            const r = await window.uhub.mail.move(open.accountId, open.folder, open.uid, 'archive')
            if (r.ok) {
              removeFromList(open)
              flash('Arquivado')
            } else flash(r.error ?? 'Falhou')
          }}
          onTrash={async () => {
            if (!open) return
            const r = await window.uhub.mail.move(open.accountId, open.folder, open.uid, 'trash')
            if (r.ok) {
              removeFromList(open)
              flash('Movido para a lixeira')
            } else flash(r.error ?? 'Falhou')
          }}
          onToggleFlag={async () => {
            if (!open) return
            await window.uhub.mail.flag(open.accountId, open.folder, open.uid, 'flagged', !open.flagged)
            setOpen({ ...open, flagged: !open.flagged })
            setItems((prev) => prev.map((x) => (x.uid === open.uid && x.accountId === open.accountId ? { ...x, flagged: !open.flagged } : x)))
          }}
          onMarkUnread={async () => {
            if (!open) return
            await window.uhub.mail.flag(open.accountId, open.folder, open.uid, 'seen', false)
            setItems((prev) => prev.map((x) => (x.uid === open.uid && x.accountId === open.accountId ? { ...x, seen: false } : x)))
            setOpen(null)
          }}
          onQuickRule={(categoryId) => {
            if (!open) return
            setRules([...rules, { id: uid(), categoryId, field: 'from', contains: open.from.address.toLowerCase() }])
            flash(`E-mails de ${open.from.address} agora vão para ${categories.find((c) => c.id === categoryId)?.name}`)
          }}
        />
        {toast && <div className="animate-rise absolute bottom-4 left-1/2 -translate-x-1/2 rounded-[4px] border border-white/10 bg-raised px-3 py-2 text-[12px] text-zinc-200 shadow-xl">{toast}</div>}
      </section>

      {setup && (
        <AccountSetup
          initial={setup === 'new' ? null : setup}
          onClose={() => setSetup(null)}
          onSaved={(a) => {
            setSetup(null)
            setFolders((x) => {
              const n = { ...x }
              delete n[a.id]
              return n
            })
          }}
        />
      )}
      {draft && (
        <Compose
          draft={draft}
          accounts={accounts}
          contacts={contacts}
          onClose={(sent) => {
            setDraft(null)
            if (sent) flash('E-mail enviado')
          }}
        />
      )}
      {managing && (
        <CategoriesManager
          categories={categories}
          rules={rules}
          onChange={(c, r) => {
            setCategories(c)
            setRules(r)
          }}
          onClose={() => setManaging(false)}
        />
      )}
    </div>
  )
}

function SideTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="eyebrow mb-1 flex items-center gap-1.5 px-2 pt-2">
      {children}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  )
}

function SideItem({ active, onClick, icon, children, count }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode; count?: number | null }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-left text-[13px] transition-colors ${active ? 'bg-volt/15 text-zinc-50' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'}`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {!!count && <span className="font-mono text-[10px] text-volt-soft">{count}</span>}
    </button>
  )
}

function MailRow({
  m,
  active,
  cats,
  showAccount,
  onOpen,
  onCopied
}: {
  m: MailSummary
  active: boolean
  cats: { id: string; name: string; icon: string; accent: keyof typeof ACCENTS }[]
  showAccount?: MailAccount
  onOpen: () => void
  onCopied: () => void
}) {
  const [copied, setCopied] = useState(false)
  const name = m.from.name || m.from.address
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      className={`group relative cursor-pointer border-b border-white/[0.04] px-3 py-2.5 transition-colors ${active ? 'bg-volt/[0.12]' : 'hover:bg-white/[0.03]'}`}
    >
      {!m.seen && <span className="absolute top-4 left-1 size-1.5 rounded-full bg-volt shadow-[0_0_6px_var(--color-volt)]" />}
      <div className="flex items-baseline gap-2 pl-2">
        <span className={`min-w-0 flex-1 truncate text-[13px] ${m.seen ? 'text-zinc-400' : 'font-semibold text-zinc-100'}`}>{name}</span>
        {m.flagged && <Star className="size-3 shrink-0 text-amber-300" fill="currentColor" />}
        {m.hasAttachments && <Paperclip className="size-3 shrink-0 text-zinc-500" />}
        <span className="shrink-0 font-mono text-[10px] text-zinc-600">{when(m.date)}</span>
      </div>
      <div className={`truncate pl-2 text-[12px] ${m.seen ? 'text-zinc-500' : 'text-zinc-200'}`}>{m.subject || '(sem assunto)'}</div>
      <div className="truncate pl-2 text-[11px] text-zinc-600">{m.snippet}</div>
      {(m.code || cats.length > 0 || showAccount) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-2">
          {m.code && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                await window.uhub.clipboard.copy(m.code!, true)
                setCopied(true)
                onCopied()
                setTimeout(() => setCopied(false), 1500)
              }}
              className="inline-flex items-center gap-1 rounded-[3px] border border-acid/40 bg-acid/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200 transition-colors hover:bg-acid/20"
              title="Copiar código"
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {m.code}
            </button>
          )}
          {cats.map((c) => {
            const Icon = iconFor(c.icon)
            return (
              <span key={c.id} className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] ${ACCENTS[c.accent].tone}`}>
                <Icon className="size-3" /> {c.name}
              </span>
            )
          })}
          {showAccount && <span className={`font-mono text-[9px] ${ACCENTS[showAccount.accent].tone.split(' ')[0]}`}>{showAccount.email}</span>}
        </div>
      )}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="space-y-2 border-b border-white/[0.04] px-5 py-3">
      <div className="flex gap-3">
        <span className="h-3 w-1/3 animate-pulse rounded-full bg-white/[0.07]" />
        <span className="ml-auto h-3 w-10 animate-pulse rounded-full bg-white/[0.05]" />
      </div>
      <span className="block h-3 w-3/4 animate-pulse rounded-full bg-white/[0.06]" />
      <span className="block h-2.5 w-full animate-pulse rounded-full bg-white/[0.04]" />
    </div>
  )
}
