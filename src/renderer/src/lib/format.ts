export const pct = (n: number): string => `${n.toFixed(0)}%`

export function bytes(n: number, digits = 1): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(i === 0 ? 0 : digits)} ${units[i]}`
}

export const kbps = (bytesPerSec: number): number => bytesPerSec / 1024

export function rate(bytesPerSec: number): string {
  const kb = kbps(bytesPerSec)
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB/s` : `${kb.toFixed(1)} KB/s`
}

export const uid = (): string => crypto.randomUUID()
