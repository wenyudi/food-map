import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Point } from '../api'

// 圈友新记了什么：记住这台设备看过哪些记录 id，比时间戳稳（不受服务器时区影响）。
// 第一次打开不算新，免得老记录全亮。

const keyOf = (circleId?: number) => `seen_records_${circleId ?? 0}`
const readSeen = (key: string): Set<string> | null => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? new Set(JSON.parse(raw) as string[]) : null
  } catch {
    return null
  }
}

function recordIds(p: Point) {
  const ids = p.visits.map((v) => ({ id: v.visit_id, by: v.recorded_by }))
  if (p.wish) ids.push({ id: p.wish.wish_id, by: p.wish.recorded_by })
  return ids
}

export function useActivity(points: Point[], myUsername: string | undefined, circleId: number | undefined) {
  const key = keyOf(circleId)
  const [tick, setTick] = useState(0)

  const allIds = useMemo(() => points.flatMap(recordIds).map((r) => r.id), [points])
  const newPoiIds = useMemo(() => {
    const seen = readSeen(key)
    if (!seen || points.length === 0) return new Set<string>()
    return new Set(points.filter((p) => recordIds(p).some((r) => r.by && r.by !== myUsername && !seen.has(r.id))).map((p) => p.poi_id))
    // tick：markSeen 之后重新算
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, myUsername, key, tick])

  // 这个圈第一次有数据：全部算看过
  useEffect(() => {
    if (allIds.length > 0 && !readSeen(key)) localStorage.setItem(key, JSON.stringify(allIds))
  }, [allIds, key])

  const markSeen = useCallback(() => {
    if (allIds.length === 0) return
    localStorage.setItem(key, JSON.stringify(allIds))
    setTick((t) => t + 1)
  }, [allIds, key])

  return { newPoiIds, markSeen }
}
