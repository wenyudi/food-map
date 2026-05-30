import type { Point } from '../api'

// 片区（商圈）聚合：把散点归到商圈，算出"吃过 / 想去"和探索进度。
// ⚠️ areaKey 的口径必须和后端 server._area_key 一致：商圈 → 行政区 → 「其他」
export interface Area {
  key: string                       // 归类键（与后端称号的 name 对齐）
  name: string                      // 展示名（去掉尾部的「区/市」更自然）
  eaten: Point[]                    // 吃过的店（visit_count > 0）
  want: Point[]                     // 想去还没去的店
  total: number                     // eaten + want（本片区记录过的店家数）
  rate: number                      // eaten / total —— 片区点亮度
  center: [number, number] | null   // [lat, lng] 质心（只用有坐标的点；都没坐标则 null）
  cuisines: string[]                // top 菜系（来自隐形维度）
  flavors: string[]                 // top 口味
}

const areaKey = (p: Point) =>
  (p.business_area || '').trim() || (p.district || '').trim() || '其他'

const trimName = (k: string) => k.replace(/[区市]$/, '') || k

const topN = (o: Record<string, number>, n: number) =>
  Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0])

export function buildAreas(points: Point[]): Area[] {
  const groups = new Map<string, Point[]>()
  for (const p of points) {
    const k = areaKey(p)
    const arr = groups.get(k)
    if (arr) arr.push(p)
    else groups.set(k, [p])
  }

  const areas: Area[] = []
  for (const [key, pts] of groups) {
    const eaten = pts.filter(p => p.visit_count > 0)
    const want = pts.filter(p => p.visit_count === 0 && p.status === 'want')
    const total = eaten.length + want.length
    if (total === 0) continue

    const located = pts.filter(p => p.lng && p.lat)
    const center: [number, number] | null = located.length
      ? [
          located.reduce((s, p) => s + p.lat, 0) / located.length,
          located.reduce((s, p) => s + p.lng, 0) / located.length,
        ]
      : null

    // 隐形维度聚合（只看吃过的店）
    const cuiCt: Record<string, number> = {}
    const flaCt: Record<string, number> = {}
    eaten.forEach(p => p.visits.forEach(v => {
      if (v.cuisine) cuiCt[v.cuisine] = (cuiCt[v.cuisine] || 0) + 1
      ;(v.flavors || '').split(',').forEach(f => {
        const t = f.trim()
        if (t) flaCt[t] = (flaCt[t] || 0) + 1
      })
    }))

    areas.push({
      key,
      name: trimName(key),
      eaten,
      want,
      total,
      rate: eaten.length / total,
      center,
      cuisines: topN(cuiCt, 2),
      flavors: topN(flaCt, 2),
    })
  }

  // 吃得越多越靠前
  areas.sort((a, b) => b.eaten.length - a.eaten.length || b.total - a.total)
  return areas
}
