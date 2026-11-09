import type { Point } from '../api'
import { getStatus, storeCuisine } from '../components/StoreTimeline'
import { MOODS } from './moods'
import type { Mood } from './moods'

// 地图和列表看的是同一批店：范围（全部/吃过/想去）+ 多维筛选 + 搜索词，规则只在这里写一份。

export type Scope = 'all' | 'visited' | 'want'
export type SortKey = 'recent' | 'near'
export type StatusKey = 'fav' | 'fulfilled' | 'repeat'

export const STATUS_OPTS: { key: StatusKey; label: string; icon: string }[] = [
  { key: 'fav', label: '想再来', icon: 'favorite' },
  { key: 'fulfilled', label: '已兑现', icon: 'auto_awesome' },
  { key: 'repeat', label: '二刷以上', icon: 'replay' },
]

/** 多维筛选：维度内多选(OR)，跨维度 AND；空 = 不筛 */
export type Filters = { moods: Mood[]; status: StatusKey[]; cuisines: string[]; authors: string[] }
export const NO_FILTERS: Filters = { moods: [], status: [], cuisines: [], authors: [] }

export const filterCount = (f: Filters) => f.moods.length + f.status.length + f.cuisines.length + f.authors.length

/** 某店是否命中某个「状态」筛选项 */
function matchStatus(p: Point, key: StatusKey): boolean {
  if (key === 'fav') return p.visits.some((v) => v.want_again)
  return getStatus(p).key === key
}

export const matchScope = (p: Point, scope: Scope) => scope === 'all' || (scope === 'visited' ? p.visit_count > 0 : p.visit_count === 0)

export function latestTs(p: Point): number {
  const visits = p.visits.map((v) => Date.parse(v.date) || 0)
  const wishTs = p.wish ? Date.parse(p.wish.created_at) || 0 : 0
  return Math.max(0, wishTs, ...visits)
}

export function applyFilters(points: Point[], f: Filters, query: string): Point[] {
  const q = query.trim().toLowerCase()
  return points.filter((p) => {
    if (f.moods.length && !f.moods.some((m) => p.visits.some((v) => v.mood_emoji === m))) return false
    if (f.status.length && !f.status.some((s) => matchStatus(p, s))) return false
    if (f.cuisines.length && !f.cuisines.includes(storeCuisine(p))) return false
    if (f.authors.length && !f.authors.some((a) => p.visits.some((v) => v.recorded_by === a) || p.wish?.recorded_by === a)) return false
    if (q && !p.name.toLowerCase().includes(q)) return false
    return true
  })
}

/** 各维度选项的全局计数（独立于当前选择） */
export function facetsOf(points: Point[]) {
  const moodCount: Record<string, number> = {}
  const statusCount: Record<string, number> = {}
  const cuisineCount: Record<string, number> = {}
  const authorMap = new Map<string, string>()
  MOODS.forEach((m) => (moodCount[m] = 0))
  STATUS_OPTS.forEach((s) => (statusCount[s.key] = 0))
  points.forEach((p) => {
    MOODS.forEach((m) => {
      if (p.visits.some((v) => v.mood_emoji === m)) moodCount[m]++
    })
    STATUS_OPTS.forEach((s) => {
      if (matchStatus(p, s.key)) statusCount[s.key]++
    })
    const t = storeCuisine(p)
    if (t) cuisineCount[t] = (cuisineCount[t] || 0) + 1
    p.visits.forEach((v) => v.recorded_by && authorMap.set(v.recorded_by, v.recorded_by_name || v.recorded_by))
    if (p.wish?.recorded_by) authorMap.set(p.wish.recorded_by, p.wish.recorded_by_name || p.wish.recorded_by)
  })
  return {
    moodCount,
    statusCount,
    cuisineList: Object.entries(cuisineCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => ({ name, n })),
    authorList: [...authorMap.entries()].map(([u, nick]) => ({ u, nick })),
  }
}

/** 记一笔按钮的文案：去过的再记，想去的算吃过了 */
export const recordLabel = (p: Point) => (p.visit_count > 0 ? '再记一笔' : '吃过了，记一笔')
