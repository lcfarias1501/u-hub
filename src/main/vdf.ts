/**
 * Minimal parser for Valve's text KeyValues format (.vdf / .acf):
 *   "key" "value"   or   "key" { ...nested... }
 * Comments (//) and escaped quotes are handled; conditionals ([$WIN32]) are skipped.
 */
export type Vdf = { [key: string]: string | Vdf }

export function parseVdf(text: string): Vdf {
  let i = 0
  const n = text.length

  const skip = (): void => {
    while (i < n) {
      const c = text[i]
      if (c === '/' && text[i + 1] === '/') while (i < n && text[i] !== '\n') i++
      else if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++
      else if (c === '[') {
        while (i < n && text[i] !== ']') i++
        i++ // past ']'
      } else break
    }
  }

  const token = (): string | null => {
    skip()
    if (i >= n) return null
    const c = text[i]
    if (c === '{' || c === '}') return text[i++]
    if (c === '"') {
      let out = ''
      i++
      while (i < n && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < n) {
          const e = text[++i]
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e
        } else out += text[i]
        i++
      }
      i++
      return out
    }
    let out = ''
    while (i < n && !/\s|[{}"]/.test(text[i])) out += text[i++]
    return out
  }

  const block = (): Vdf => {
    const obj: Vdf = {}
    for (;;) {
      const key = token()
      if (key === null || key === '}') return obj
      const next = token()
      if (next === '{') obj[key] = block()
      else if (next !== null) obj[key] = next
    }
  }

  return block()
}

/** Case-insensitive path lookup — Valve isn't consistent about key casing ("apps" vs "Apps"). */
export function vdfGet(obj: Vdf | string | undefined, ...path: string[]): Vdf | string | undefined {
  let cur: Vdf | string | undefined = obj
  for (const p of path) {
    if (!cur || typeof cur === 'string') return undefined
    const k: string | undefined = Object.keys(cur).find((x) => x.toLowerCase() === p.toLowerCase())
    cur = k === undefined ? undefined : cur[k]
  }
  return cur
}
