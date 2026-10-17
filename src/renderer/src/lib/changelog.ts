import raw from '../../../../CHANGELOG.md?raw'

export interface ChangelogEntry {
  version: string
  date: string | null
  groups: { title: string; items: { text: string; children: string[] }[] }[]
}

/** Parses the subset of Markdown CHANGELOG.md uses: ## versions, ### groups, "- " items with one nesting level. */
function parse(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = []
  let entry: ChangelogEntry | null = null
  let group: ChangelogEntry['groups'][number] | null = null
  for (const line of md.split('\n')) {
    const v = line.match(/^## \[([^\]]+)\](?:\s*-\s*(\S+))?/)
    if (v) {
      entry = { version: v[1], date: v[2] ?? null, groups: [] }
      group = null
      out.push(entry)
      continue
    }
    if (!entry) continue
    const g = line.match(/^### (.+)/)
    if (g) {
      group = { title: g[1].trim(), items: [] }
      entry.groups.push(group)
      continue
    }
    const item = line.match(/^- (.+)/)
    if (item && group) {
      group.items.push({ text: item[1], children: [] })
      continue
    }
    const child = line.match(/^\s{2,}- (.+)/)
    if (child && group?.items.length) group.items[group.items.length - 1].children.push(child[1])
  }
  return out
}

export const CHANGELOG = parse(raw)

const cmp = (a: string, b: string): number => {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  return 0
}

/** Released versions newer than `since`, up to and including `current`, newest first. */
export function changesBetween(since: string, current: string): ChangelogEntry[] {
  return CHANGELOG.filter((e) => /^\d+\.\d+\.\d+$/.test(e.version) && cmp(e.version, since) > 0 && cmp(e.version, current) <= 0)
}
