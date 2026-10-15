import si, { type Systeminformation } from 'systeminformation'
import type { SystemSnapshot, SystemStatic } from '@shared/types'

const TICK_MS = 1000
const SLOW_TICK_MS = 5000
// On macOS si.mem() spawns two helper processes per call, so memory is read every other tick.
const MEM_TICK_MS = 2000

type Slow = Pick<SystemSnapshot, 'battery' | 'temp'>

let slowCache: Slow = {
  battery: { present: false, percent: 0, charging: false, timeRemaining: null },
  temp: { main: null, max: null }
}
let lastSlowAt = 0
let memCache: Systeminformation.MemData | null = null
let lastMemAt = 0

async function readSlow(): Promise<Slow> {
  const [bat, temp] = await Promise.all([si.battery(), si.cpuTemperature()])
  // systeminformation reports missing sensors as null/-1 depending on platform.
  const valid = (n: number | null | undefined): number | null =>
    typeof n === 'number' && n > 0 ? n : null
  return {
    battery: {
      present: bat.hasBattery,
      percent: bat.percent,
      charging: bat.isCharging,
      // macOS reports 65535 while plugged in; anything beyond a day is not a real estimate.
      timeRemaining: !bat.isCharging && bat.timeRemaining > 0 && bat.timeRemaining < 1440 ? bat.timeRemaining : null
    },
    temp: { main: valid(temp.main), max: valid(temp.max) }
  }
}

async function sample(): Promise<SystemSnapshot> {
  const needMem = !memCache || Date.now() - lastMemAt >= MEM_TICK_MS
  const [load, freshMem, net] = await Promise.all([si.currentLoad(), needMem ? si.mem() : null, si.networkStats()])
  if (freshMem) {
    memCache = freshMem
    lastMemAt = Date.now()
  }
  const mem = memCache!

  if (Date.now() - lastSlowAt > SLOW_TICK_MS) {
    lastSlowAt = Date.now()
    slowCache = await readSlow().catch(() => slowCache)
  }

  const iface = net[0]
  return {
    t: Date.now(),
    cpu: { total: load.currentLoad, cores: load.cpus.map((c) => c.load) },
    // `active` excludes reclaimable cache, which matches what users expect from "used".
    mem: { total: mem.total, used: mem.active, free: mem.total - mem.active, swapUsed: mem.swapused },
    net: {
      rxSec: Math.max(0, iface?.rx_sec ?? 0),
      txSec: Math.max(0, iface?.tx_sec ?? 0),
      iface: iface?.iface ?? '—'
    },
    ...slowCache
  }
}

export async function readStatic(): Promise<SystemStatic> {
  const [cpu, os] = await Promise.all([si.cpu(), si.osInfo()])
  return {
    cpuBrand: `${cpu.manufacturer} ${cpu.brand}`.trim(),
    cpuCores: cpu.cores,
    cpuSpeed: cpu.speed,
    os: `${os.distro} ${os.release}`,
    hostname: os.hostname,
    arch: os.arch
  }
}

/**
 * Samples the system once per second and hands each snapshot to `emit`. Sampling
 * pauses entirely while `isActive()` is false (window minimized or hidden), so the
 * app costs nothing in the background. Returns a stop function.
 */
export function startMonitor(emit: (s: SystemSnapshot) => void, isActive: () => boolean): () => void {
  let busy = false
  const timer = setInterval(async () => {
    if (busy || !isActive()) return
    busy = true
    try {
      emit(await sample())
    } catch (err) {
      console.error('[system] sample failed', err)
    } finally {
      busy = false
    }
  }, TICK_MS)
  return () => clearInterval(timer)
}
