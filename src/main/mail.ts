import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageAddressObject } from 'imapflow'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import nodemailer, { type Transporter } from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer'
import { dialog, type BrowserWindow } from 'electron'
import {
  categorize,
  extractCodes,
  extractGameKeys,
  type MailAccount,
  type MailAccountStatus,
  type MailAddress,
  type MailDraft,
  type MailFolder,
  type MailMessage,
  type MailSummary
} from '@shared/types'
import { notify } from './notifications'
import { getValue, readSealedMap, setValue, writeSealedMap } from './storage'

const PAGE = 40
const PREVIEW_BYTES = 4 * 1024
const RECONNECT_MS = 30_000
const UNREAD_REFRESH_MS = 2 * 60_000

/**
 * Two IMAP connections per account: a long-lived "watcher" that IDLEs on the
 * inbox (instant new-mail events) and a "worker" for everything the UI asks.
 * Mixing both on one connection would keep pulling the IDLE away from INBOX.
 */
interface Conn {
  account: MailAccount
  worker: ImapFlow | null
  watcher: ImapFlow | null
  status: MailAccountStatus
  lastUid: number
  retry?: NodeJS.Timeout
}

const conns = new Map<string, Conn>()
let getWin: () => BrowserWindow | null = () => null
/** Parsed messages kept briefly so attachments can be saved without re-downloading. */
const parsedCache = new Map<string, ParsedMail>()

const password = (id: string): string | null => readSealedMap('mailSecrets')[id] ?? null

function emitStatus(): void {
  getWin()?.webContents.send('mail:status', [...conns.values()].map((c) => c.status))
}

/** Common IMAP/SMTP failures → Portuguese hints that say what to do. */
export function mailError(e: unknown): string {
  const err = e as { message?: string; code?: string; authenticationFailed?: boolean; responseText?: string; responseCode?: number }
  const msg = `${err.responseText ?? ''} ${err.message ?? ''}`.toLowerCase()
  if (err.authenticationFailed || err.code === 'EAUTH' || msg.includes('authenticat') || msg.includes('invalid credentials') || msg.includes('login failed'))
    return 'Usuário ou senha recusados. Em Gmail/iCloud/Yahoo use uma senha de app, não a senha normal.'
  if (err.code === 'ENOTFOUND' || msg.includes('getaddrinfo')) return 'Servidor não encontrado. Confira o endereço IMAP/SMTP.'
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || msg.includes('timeout')) return 'Não foi possível conectar. Confira porta, segurança (SSL/STARTTLS) e sua internet.'
  if (msg.includes('certificate') || msg.includes('self signed')) return 'Certificado do servidor não confiável.'
  if (msg.includes('basicauthblocked') || msg.includes('basic authentication')) return 'Este provedor não aceita login com senha (exige login Microsoft/OAuth).'
  return err.message ?? String(e)
}

function imapClient(account: MailAccount, pass: string): ImapFlow {
  return new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth: { user: account.username, pass },
    logger: false,
    emitLogs: false
  })
}

function smtpTransport(account: MailAccount, pass: string): Transporter {
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    requireTLS: !account.smtp.secure,
    auth: { user: account.username, pass }
  })
}

// ── Accounts ─────────────────────────────────────────────────────────────────

/** Logs in to IMAP and verifies SMTP before an account is saved. */
export async function testAccount(account: MailAccount, pass: string): Promise<{ ok: boolean; error?: string }> {
  const imap = imapClient(account, pass)
  try {
    await imap.connect()
    await imap.logout()
  } catch (e) {
    return { ok: false, error: `IMAP: ${mailError(e)}` }
  }
  try {
    await smtpTransport(account, pass).verify()
  } catch (e) {
    return { ok: false, error: `SMTP: ${mailError(e)}` }
  }
  return { ok: true }
}

export async function saveAccount(account: MailAccount, pass: string | null): Promise<{ ok: boolean; error?: string }> {
  const effective = pass ?? password(account.id)
  if (!effective) return { ok: false, error: 'Informe a senha.' }
  const test = await testAccount(account, effective)
  if (!test.ok) return test
  writeSealedMap('mailSecrets', { ...readSealedMap('mailSecrets'), [account.id]: effective })
  const list = getValue('mailAccounts')
  setValue('mailAccounts', list.some((a) => a.id === account.id) ? list.map((a) => (a.id === account.id ? account : a)) : [...list, account])
  await disconnect(account.id)
  void connect(account)
  return { ok: true }
}

export async function removeAccount(id: string): Promise<void> {
  await disconnect(id)
  conns.delete(id)
  const secrets = readSealedMap('mailSecrets')
  delete secrets[id]
  writeSealedMap('mailSecrets', secrets)
  setValue('mailAccounts', getValue('mailAccounts').filter((a) => a.id !== id))
  emitStatus()
}

async function disconnect(id: string): Promise<void> {
  const c = conns.get(id)
  if (!c) return
  clearTimeout(c.retry)
  await Promise.allSettled([c.worker?.logout(), c.watcher?.logout()])
  c.worker = null
  c.watcher = null
}

async function connect(account: MailAccount): Promise<void> {
  const pass = password(account.id)
  const c: Conn = conns.get(account.id) ?? { account, worker: null, watcher: null, status: { id: account.id, state: 'connecting', error: null, unread: 0 }, lastUid: 0 }
  c.account = account
  conns.set(account.id, c)
  if (!pass) {
    c.status = { ...c.status, state: 'error', error: 'Senha não encontrada neste computador. Edite a conta e informe a senha.' }
    return emitStatus()
  }
  c.status = { ...c.status, state: 'connecting', error: null }
  emitStatus()

  try {
    c.worker = imapClient(account, pass)
    c.watcher = imapClient(account, pass)
    for (const cl of [c.worker, c.watcher]) {
      cl.on('error', () => undefined)
      cl.on('close', () => scheduleReconnect(account.id))
    }
    await Promise.all([c.worker.connect(), c.watcher.connect()])

    // Watcher: stays on INBOX; IDLE kicks in automatically when idle.
    const box = await c.watcher.mailboxOpen('INBOX')
    c.lastUid = Math.max(0, (box.uidNext ?? 1) - 1)
    c.watcher.on('exists', () => void onNewMail(account.id))

    c.status = { ...c.status, state: 'online', error: null }
    await refreshUnread(account.id)
  } catch (e) {
    c.status = { ...c.status, state: 'error', error: mailError(e) }
    emitStatus()
    scheduleReconnect(account.id)
  }
}

function scheduleReconnect(id: string): void {
  const c = conns.get(id)
  if (!c || c.retry) return
  if (c.status.state === 'online') c.status = { ...c.status, state: 'offline' }
  emitStatus()
  c.retry = setTimeout(() => {
    c.retry = undefined
    if (!getValue('mailAccounts').some((a) => a.id === id)) return
    void disconnect(id).then(() => connect(c.account))
  }, RECONNECT_MS)
}

async function worker(id: string): Promise<ImapFlow> {
  const c = conns.get(id)
  if (!c?.worker?.usable) {
    const account = getValue('mailAccounts').find((a) => a.id === id)
    if (!account) throw new Error('Conta não encontrada')
    await disconnect(id)
    await connect(account)
  }
  const w = conns.get(id)?.worker
  if (!w?.usable) throw new Error(conns.get(id)?.status.error ?? 'Sem conexão com o servidor')
  return w
}

async function refreshUnread(id: string): Promise<void> {
  const c = conns.get(id)
  if (!c?.worker?.usable) return
  try {
    const st = await c.worker.status('INBOX', { unseen: true })
    c.status = { ...c.status, unread: st ? (st.unseen ?? 0) : 0 }
  } catch {
    /* keep last value */
  }
  emitStatus()
}

// ── New mail ─────────────────────────────────────────────────────────────────

async function onNewMail(id: string): Promise<void> {
  const c = conns.get(id)
  if (!c?.watcher?.usable) return
  const fresh: MailSummary[] = []
  try {
    for await (const msg of c.watcher.fetch(`${c.lastUid + 1}:*`, { uid: true, envelope: true, flags: true, bodyStructure: true, source: { start: 0, maxLength: PREVIEW_BYTES } }, { uid: true })) {
      if (msg.uid <= c.lastUid) continue
      const p = await preview(msg.source, msg.envelope?.subject ?? '')
      cachePreview(id, 'INBOX', msg.uid, p)
      fresh.push(summarize(id, 'INBOX', msg, p))
      c.lastUid = Math.max(c.lastUid, msg.uid)
    }
  } catch {
    return
  }
  if (!fresh.length) return
  getWin()?.webContents.send('mail:new', fresh)
  await refreshUnread(id)

  const rules = getValue('mailRules')
  const cats = getValue('mailCategories')
  for (const m of fresh.filter((x) => !x.seen)) {
    const mine = categorize(m, rules)
    const wanted = c.account.notify === 'all' || (c.account.notify === 'categories' && mine.some((cid) => cats.find((k) => k.id === cid)?.notify))
    if (!wanted) continue
    notify({
      kind: 'mail',
      title: m.from.name || m.from.address,
      body: m.code ? `Código ${m.code} · ${m.subject}` : m.subject || '(sem assunto)',
      view: 'mail'
    })
  }
}

// ── Reading ──────────────────────────────────────────────────────────────────

const addr = (a?: MessageAddressObject): MailAddress => ({ name: a?.name ?? '', address: a?.address ?? '' })
const addrList = (v?: AddressObject | AddressObject[]): MailAddress[] =>
  (Array.isArray(v) ? v : v ? [v] : []).flatMap((o) => o.value.map((x) => ({ name: x.name ?? '', address: x.address ?? '' })))

function hasAttachment(node: FetchMessageObject['bodyStructure']): boolean {
  if (!node) return false
  if (node.disposition === 'attachment') return true
  return (node.childNodes ?? []).some(hasAttachment)
}

/** Snippet + verification code from the first bytes of a message (cheap MIME parse). */
async function preview(source: Buffer | undefined, subject: string): Promise<{ snippet: string; code: string | null }> {
  if (!source) return { snippet: '', code: null }
  try {
    const p = await simpleParser(source, { skipHtmlToText: false, skipImageLinks: true, skipTextLinks: true })
    const text = p.text ?? ''
    return { snippet: text.replace(/\s+/g, ' ').trim().slice(0, 180), code: extractCodes(subject, text)[0] ?? null }
  } catch {
    return { snippet: '', code: null } // truncated or odd MIME: no preview
  }
}

/** Previews already computed, so revisiting a folder shows them instantly. */
const previewCache = new Map<string, { snippet: string; code: string | null }>()
const pkey = (id: string, folder: string, uid: number): string => `${id}|${folder}|${uid}`
function cachePreview(id: string, folder: string, uid: number, p: { snippet: string; code: string | null }): void {
  previewCache.set(pkey(id, folder, uid), p)
  if (previewCache.size > 5000) previewCache.delete(previewCache.keys().next().value!)
}

function summarize(accountId: string, folder: string, msg: FetchMessageObject, p?: { snippet: string; code: string | null }): MailSummary {
  const cached = p ?? previewCache.get(pkey(accountId, folder, msg.uid))
  return {
    accountId,
    folder,
    uid: msg.uid,
    from: addr(msg.envelope?.from?.[0]),
    to: (msg.envelope?.to ?? []).map(addr),
    subject: msg.envelope?.subject ?? '',
    date: new Date(msg.envelope?.date ?? msg.internalDate ?? Date.now()).getTime(),
    seen: msg.flags?.has('\\Seen') ?? false,
    flagged: msg.flags?.has('\\Flagged') ?? false,
    hasAttachments: hasAttachment(msg.bodyStructure),
    snippet: cached?.snippet ?? '',
    code: cached?.code ?? null
  }
}

// ── Background previews ──────────────────────────────────────────────────────

const PREVIEW_BATCH = 10
const previewRun = new Map<string, number>()

/**
 * Fetches previews after the list is already on screen, in small batches so a
 * new request (opening a mail, switching folder) never waits long for the
 * connection. Starting a new run for an account cancels the previous one.
 */
function schedulePreviews(id: string, folder: string, uids: number[]): void {
  const run = (previewRun.get(id) ?? 0) + 1
  previewRun.set(id, run)
  const todo = uids.filter((u) => !previewCache.has(pkey(id, folder, u)))
  if (!todo.length) return
  void (async () => {
    for (let i = 0; i < todo.length; i += PREVIEW_BATCH) {
      if (previewRun.get(id) !== run) return
      const batch = todo.slice(i, i + PREVIEW_BATCH)
      const fetched: FetchMessageObject[] = []
      try {
        const w = await worker(id)
        const lock = await w.getMailboxLock(folder)
        try {
          for await (const m of w.fetch(batch, { uid: true, envelope: true, source: { start: 0, maxLength: PREVIEW_BYTES } }, { uid: true })) fetched.push(m)
        } finally {
          lock.release()
        }
      } catch {
        return
      }
      const out = await Promise.all(
        fetched.map(async (m) => {
          const p = await preview(m.source, m.envelope?.subject ?? '')
          cachePreview(id, folder, m.uid, p)
          return { accountId: id, folder, uid: m.uid, ...p }
        })
      )
      if (out.length) getWin()?.webContents.send('mail:previews', out)
    }
  })()
}

export async function listFolders(id: string): Promise<MailFolder[]> {
  const w = await worker(id)
  const all: ListResponse[] = await w.list({ statusQuery: { unseen: true } })
  const rank = (f: ListResponse): number => {
    const order = ['\\Inbox', '\\Flagged', '\\Sent', '\\Drafts', '\\Archive', '\\All', '\\Junk', '\\Trash']
    const i = f.path.toUpperCase() === 'INBOX' ? 0 : order.indexOf(f.specialUse ?? '')
    return i < 0 ? 100 : i
  }
  return all
    .filter((f) => !f.flags.has('\\Noselect'))
    .sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      name: f.path.toUpperCase() === 'INBOX' ? 'Entrada' : f.name,
      specialUse: f.path.toUpperCase() === 'INBOX' ? '\\Inbox' : (f.specialUse ?? null),
      unread: f.status?.unseen ?? null
    }))
}

const LIST_QUERY = { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true } as const

/**
 * Newest first, PAGE at a time. Without a search this reads a sequence range
 * straight from the mailbox size (no SEARCH ALL, which is slow on big Gmail
 * folders) and returns headers only; previews follow in the background.
 */
export async function listMessages(id: string, folder: string, page = 0, query = ''): Promise<{ items: MailSummary[]; total: number }> {
  const w = await worker(id)
  const lock = await w.getMailboxLock(folder)
  const items: MailSummary[] = []
  let total = 0
  try {
    if (query.trim()) {
      const q = query.trim()
      const found = ((await w.search({ or: [{ from: q }, { to: q }, { subject: q }] }, { uid: true })) || []) as number[]
      found.sort((a, b) => b - a)
      total = found.length
      const slice = found.slice(page * PAGE, page * PAGE + PAGE)
      if (slice.length) for await (const msg of w.fetch(slice, LIST_QUERY, { uid: true })) items.push(summarize(id, folder, msg))
    } else {
      total = w.mailbox ? w.mailbox.exists : 0
      const end = total - page * PAGE
      if (end >= 1) {
        const start = Math.max(1, end - PAGE + 1)
        for await (const msg of w.fetch(`${start}:${end}`, LIST_QUERY)) items.push(summarize(id, folder, msg))
      }
    }
  } finally {
    lock.release()
  }
  items.sort((a, b) => b.date - a.date)
  schedulePreviews(id, folder, items.map((m) => m.uid))
  return { items, total }
}

/** Unified view of a category: recent inbox mail from every account matching its rules. */
export async function listCategory(categoryId: string): Promise<MailSummary[]> {
  const rules = getValue('mailRules').filter((r) => r.categoryId === categoryId)
  // Accounts in parallel; an offline one just contributes nothing.
  const lists = await Promise.all(
    getValue('mailAccounts').map(async (a) => {
      try {
        const { items } = await listMessages(a.id, 'INBOX', 0)
        const matched = items.filter((m) => categorize(m, rules).length)
        schedulePreviews(a.id, 'INBOX', matched.map((m) => m.uid))
        return matched
      } catch {
        return []
      }
    })
  )
  return lists.flat().sort((a, b) => b.date - a.date)
}

export async function openMessage(id: string, folder: string, uid: number): Promise<MailMessage> {
  const w = await worker(id)
  const lock = await w.getMailboxLock(folder)
  try {
    const msg = await w.fetchOne(String(uid), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true, source: true }, { uid: true })
    if (!msg || !msg.source) throw new Error('Mensagem não encontrada')
    const p = await simpleParser(msg.source)
    parsedCache.set(`${id}|${folder}|${uid}`, p)
    if (parsedCache.size > 20) parsedCache.delete(parsedCache.keys().next().value!)
    if (!msg.flags?.has('\\Seen')) {
      await w.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      void refreshUnread(id)
    }

    // Inline images (cid:) become data: URLs so the sandboxed reader can show them.
    let html = typeof p.html === 'string' ? p.html : null
    if (html) {
      for (const att of p.attachments) {
        if (att.cid) html = html.split(`cid:${att.cid}`).join(`data:${att.contentType};base64,${att.content.toString('base64')}`)
      }
    }
    const base = summarize(id, folder, msg)
    const text = p.text ?? ''
    return {
      ...base,
      seen: true,
      snippet: text.slice(0, 180),
      code: extractCodes(p.subject ?? '', text)[0] ?? null,
      cc: addrList(p.cc),
      replyTo: addrList(p.replyTo),
      messageId: p.messageId ?? null,
      references: Array.isArray(p.references) ? p.references : p.references ? [p.references] : [],
      html,
      text,
      attachments: p.attachments
        .map((a, index) => ({ index, filename: a.filename ?? `anexo-${index + 1}`, contentType: a.contentType, size: a.size, inline: !!a.cid && a.contentDisposition === 'inline' }))
        .filter((a) => !a.inline)
        .map(({ inline: _inline, ...a }) => a),
      codes: extractCodes(p.subject ?? '', text),
      gameKeys: extractGameKeys(`${p.subject ?? ''}\n${text}`),
      remoteImages: !!html && /<img[^>]+src=["']?https?:/i.test(html)
    }
  } finally {
    lock.release()
  }
}

export async function saveAttachment(id: string, folder: string, uid: number, index: number): Promise<{ ok: boolean; path?: string }> {
  let p = parsedCache.get(`${id}|${folder}|${uid}`)
  if (!p) {
    await openMessage(id, folder, uid)
    p = parsedCache.get(`${id}|${folder}|${uid}`)
  }
  const att = p?.attachments[index]
  if (!att) return { ok: false }
  const win = getWin()
  const opts = { defaultPath: att.filename ?? 'anexo' }
  const { canceled, filePath } = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
  if (canceled || !filePath) return { ok: false }
  const { writeFile } = await import('node:fs/promises')
  await writeFile(filePath, att.content)
  return { ok: true, path: filePath }
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function setFlag(id: string, folder: string, uid: number, flag: 'seen' | 'flagged', value: boolean): Promise<void> {
  const w = await worker(id)
  const lock = await w.getMailboxLock(folder)
  try {
    const f = flag === 'seen' ? '\\Seen' : '\\Flagged'
    if (value) await w.messageFlagsAdd(String(uid), [f], { uid: true })
    else await w.messageFlagsRemove(String(uid), [f], { uid: true })
  } finally {
    lock.release()
  }
  if (flag === 'seen') void refreshUnread(id)
}

async function specialFolder(w: ImapFlow, use: string): Promise<string | null> {
  const all = await w.list()
  return all.find((f) => f.specialUse === use)?.path ?? null
}

/** Archive or trash. Without an \Archive folder (most non-Gmail servers) archive falls back to "Arquivo". */
export async function moveMessage(id: string, folder: string, uid: number, to: 'archive' | 'trash'): Promise<{ ok: boolean; error?: string }> {
  const w = await worker(id)
  let dest = await specialFolder(w, to === 'archive' ? '\\Archive' : '\\Trash')
  if (!dest && to === 'archive') dest = await specialFolder(w, '\\All')
  if (!dest && to === 'archive') {
    dest = 'Arquivo'
    await w.mailboxCreate(dest).catch(() => undefined)
  }
  const lock = await w.getMailboxLock(folder)
  try {
    if (dest && dest !== folder) await w.messageMove(String(uid), dest, { uid: true })
    else await w.messageDelete(String(uid), { uid: true })
  } catch (e) {
    return { ok: false, error: mailError(e) }
  } finally {
    lock.release()
  }
  void refreshUnread(id)
  return { ok: true }
}

// ── Sending ──────────────────────────────────────────────────────────────────

const splitAddrs = (s: string): string[] =>
  s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)

export async function send(d: MailDraft): Promise<{ ok: boolean; error?: string }> {
  const account = getValue('mailAccounts').find((a) => a.id === d.accountId)
  const pass = account && password(account.id)
  if (!account || !pass) return { ok: false, error: 'Conta não configurada neste computador.' }
  if (!splitAddrs(d.to).length) return { ok: false, error: 'Informe pelo menos um destinatário.' }

  const body = account.signature ? `${d.body}\n\n-- \n${account.signature}` : d.body
  let attachments: { filename: string; content: Buffer }[]
  try {
    attachments = await Promise.all(
      d.attachments.map(async (path) => {
        if (!(await stat(path)).isFile()) throw new Error(`"${basename(path)}" é uma pasta (no Mac alguns documentos são pastas). Compacte em .zip e anexe o .zip.`)
        return { filename: basename(path), content: await readFile(path) }
      })
    )
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    return { ok: false, error: err.code === 'ENOENT' ? 'Um dos anexos não existe mais.' : err.message }
  }
  const message = {
    from: { name: account.name, address: account.email },
    to: splitAddrs(d.to),
    cc: splitAddrs(d.cc),
    bcc: splitAddrs(d.bcc),
    subject: d.subject,
    text: body,
    inReplyTo: d.inReplyTo ?? undefined,
    references: d.references?.length ? d.references : undefined,
    attachments
  }

  try {
    const info = await smtpTransport(account, pass).sendMail(message)
    // Gmail files sent mail itself; other servers need us to append a copy to Sent.
    if (account.preset !== 'gmail') {
      const raw = await new MailComposer({ ...message, messageId: info.messageId }).compile().build()
      const w = await worker(account.id)
      const sent = await specialFolder(w, '\\Sent')
      if (sent) await w.append(sent, raw, ['\\Seen'])
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mailError(e) }
  }
}

/**
 * macOS shows some folders as single files (.app, old .pages/.key, photo
 * libraries); those can't be attached as-is, so they're reported back
 * instead of failing later at send time.
 */
export async function pickAttachments(): Promise<{ files: string[]; skipped: string[] }> {
  const win = getWin()
  const opts = { properties: ['openFile' as const, 'multiSelections' as const] }
  const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (canceled) return { files: [], skipped: [] }
  const files: string[] = []
  const skipped: string[] = []
  for (const p of filePaths) ((await stat(p).catch(() => null))?.isFile() ? files : skipped).push(p)
  return { files, skipped: skipped.map((p) => basename(p)) }
}

export const mailStatus = (): MailAccountStatus[] => [...conns.values()].map((c) => c.status)

export function startMail(win: () => BrowserWindow | null): void {
  getWin = win
  for (const a of getValue('mailAccounts')) void connect(a)
  setInterval(() => {
    for (const id of conns.keys()) void refreshUnread(id)
  }, UNREAD_REFRESH_MS)
}

export async function stopMail(): Promise<void> {
  await Promise.allSettled([...conns.keys()].map(disconnect))
}
