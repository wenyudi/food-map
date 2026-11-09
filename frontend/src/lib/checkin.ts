import type { Point } from '../api'
import { localDate } from './format'
import { getMyLocation, haversine } from './geo'

// 「吃了么？」：点过导航的店、或人就在店门口时，主动问一句，把「决定去 → 吃完 → 记一笔」接起来。
// 只存在这台设备上，不进后端。

const LS_GOING = 'checkin_going'
const LS_SNOOZE = 'checkin_snooze'

const MIN_AFTER_NAV = 30 * 60_000 // 点完导航至少过半小时才问（路上别打扰）
const MAX_AFTER_NAV = 24 * 3600_000
const NEARBY_METERS = 150
const SNOOZE_MS = 7 * 24 * 3600_000 // 点了「没去」：这家一周内不再问

export type CheckIn = { poi_id: string; name: string; reason: 'going' | 'nearby' }

type Going = { poi_id: string; name: string; at: number }

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) || 'null') as T) ?? fallback
  } catch {
    return fallback
  }
}

/** 用户点了导航：记下来，下次打开时问一句 */
export function markGoing(p: Point) {
  localStorage.setItem(LS_GOING, JSON.stringify({ poi_id: p.poi_id, name: p.name, at: Date.now() } satisfies Going))
}

/** 「吃了」：这次问完了，不再问 */
export function clearCheckIn() {
  localStorage.removeItem(LS_GOING)
}

/** 「没去」：这家一周内不再问 */
export function snoozeCheckIn(poiId: string) {
  localStorage.removeItem(LS_GOING)
  const snooze = readJson<Record<string, number>>(LS_SNOOZE, {})
  snooze[poiId] = Date.now() + SNOOZE_MS
  localStorage.setItem(LS_SNOOZE, JSON.stringify(snooze))
}

/** 附近提醒问过一次：今天不再问 */
export function snoozeToday(poiId: string) {
  const snooze = readJson<Record<string, number>>(LS_SNOOZE, {})
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  snooze[poiId] = Math.max(snooze[poiId] || 0, tomorrow.getTime())
  localStorage.setItem(LS_SNOOZE, JSON.stringify(snooze))
}

const recordedSince = (p: Point, day: string) => p.visits.some((v) => v.date >= day)

/** 已经授权过定位才静默取；没授权就不问，绝不为这个弹权限框 */
async function silentLocation() {
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' })
    return perm?.state === 'granted' ? await getMyLocation(5000) : null
  } catch {
    return null
  }
}

/** 现在该不该问、问哪家 */
export async function findCheckIn(points: Point[]): Promise<CheckIn | null> {
  const going = readJson<Going | null>(LS_GOING, null)
  if (going) {
    const age = Date.now() - going.at
    const p = points.find((x) => x.poi_id === going.poi_id)
    if (!p || age > MAX_AFTER_NAV || recordedSince(p, localDate(new Date(going.at)))) clearCheckIn()
    else if (age >= MIN_AFTER_NAV) return { poi_id: p.poi_id, name: p.name, reason: 'going' }
  }

  const loc = await silentLocation()
  if (!loc) return null
  const snooze = readJson<Record<string, number>>(LS_SNOOZE, {})
  const today = localDate()
  let best: Point | null = null
  let bestD = NEARBY_METERS
  for (const p of points) {
    if (!p.lng || !p.lat || (snooze[p.poi_id] || 0) > Date.now() || recordedSince(p, today)) continue
    const d = haversine(loc.lng, loc.lat, p.lng, p.lat)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best ? { poi_id: best.poi_id, name: best.name, reason: 'nearby' } : null
}
