import type { Point, Stats } from '../api'

// 从 /points 直接派生总览数字，省掉单独的 /stats 往返。
// 口径对齐后端 db.stats()：顿数 = Σvisit_count，花费 = Σ每条 visit.amount，
// 家店 = 有 visit 的 poi 数，想去 = 仍 want 的种草数（地图上 商圈 也是这样前端算的）。
export function deriveStats(points: Point[]): Stats {
  let total_visits = 0
  let total_amount = 0
  let total_stores_visited = 0
  let total_wishes_open = 0
  for (const p of points) {
    if (p.visit_count > 0) {
      total_stores_visited += 1
      total_visits += p.visit_count
      for (const v of p.visits) total_amount += Number(v.amount) || 0
    }
    if (p.wish && p.wish.status === 'want') total_wishes_open += 1
  }
  return { total_visits, total_amount, total_stores_visited, total_wishes_open }
}
