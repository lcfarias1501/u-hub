import { execFile, spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { shell } from 'electron'
import type { LaunchResult, Launcher } from '@shared/types'

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'steam:', 'discord:', 'spotify:', 'battlenet:', 'minecraft:'])

const expandHome = (p: string): string => (p === '~' || p.startsWith('~/') ? homedir() + p.slice(1) : p)

function run(file: string, args: string[]): Promise<LaunchResult> {
  return new Promise((resolve) => {
    execFile(file, args, (err, _stdout, stderr) => {
      resolve(err ? { ok: false, error: stderr.trim() || err.message } : { ok: true })
    })
  })
}

function detached(file: string, args: string[]): Promise<LaunchResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', shell: false })
    child.once('error', (err) => resolve({ ok: false, error: err.message }))
    child.once('spawn', () => {
      child.unref()
      resolve({ ok: true })
    })
  })
}

/** Opens a launcher target without going through a shell, so labels/targets can't inject commands. */
export async function launch(l: Launcher): Promise<LaunchResult> {
  const target = expandHome(l.target.trim())
  if (!target) return { ok: false, error: 'Alvo vazio' }

  if (l.kind === 'url') {
    let url: URL
    try {
      url = new URL(target)
    } catch {
      return { ok: false, error: 'URL inválida' }
    }
    if (!ALLOWED_SCHEMES.has(url.protocol)) return { ok: false, error: `Protocolo não permitido: ${url.protocol}` }
    await shell.openExternal(url.toString())
    return { ok: true }
  }

  switch (process.platform) {
    case 'darwin':
      if (l.kind === 'path' || target.startsWith('/')) return run('open', [target])
      return run('open', ['-a', target])
    case 'win32':
      return l.kind === 'path' ? detached('explorer.exe', [target]) : detached(target, [])
    default:
      return l.kind === 'path' ? detached('xdg-open', [target]) : detached(target, [])
  }
}
