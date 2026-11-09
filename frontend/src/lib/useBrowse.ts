import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPoints, invalidatePoints } from '../api'
import type { Point } from '../api'
import { NO_FILTERS, applyFilters, facetsOf, filterCount, latestTs, matchScope } from './browse'
import type { Filters, Scope, SortKey } from './browse'
import { getMyLocation, haversine } from './geo'
import type { MyLocation } from './geo'

const RESUME_REFRESH_MS = 60_000

/** 全 app 共用的店铺数据和浏览状态：切 Tab 不丢筛选，地图 / 列表永远看同一批店 */
export function useBrowse(enabled: boolean, circleId: number | undefined, myUsername: string | undefined) {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [scope, setScope] = useState<Scope>('all')
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [here, setHere] = useState<MyLocation | null>(null)

  // seq 防竞态：切圈/快速刷新时旧请求晚到，不能覆盖新圈数据
  const seq = useRef(0)
  const hasData = useRef(false)
  const loadedAt = useRef(0)

  // 已有数据时静默刷新，不闪骨架屏
  const reload = useCallback(() => {
    const mine = ++seq.current
    setLoading(!hasData.current)
    setLoadError(false)
    getPoints()
      .then((p) => {
        if (mine !== seq.current) return
        hasData.current = p.length > 0
        loadedAt.current = Date.now()
        setPoints(p)
      })
      .catch(() => {
        if (mine === seq.current && !hasData.current) setLoadError(true)
      })
      .finally(() => {
        if (mine === seq.current) setLoading(false)
      })
  }, [])

  const clearFilters = useCallback(() => {
    setFilters(NO_FILTERS)
    setQuery('')
  }, [])

  // 登录 / 切圈：旧圈的数据和筛选都不能留
  useEffect(() => {
    hasData.current = false
    setPoints([])
    clearFilters()
    setScope('all')
    if (enabled) reload()
  }, [enabled, circleId, reload, clearFilters])

  // 切回 app 时拉一次，圈友新记的才看得到
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > RESUME_REFRESH_MS) {
        invalidatePoints()
        reload()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, reload])

  const base = useMemo(() => applyFilters(points, filters, query), [points, filters, query])
  const counts = useMemo(
    () => ({
      all: base.length,
      visited: base.filter((p) => p.visit_count > 0).length,
      want: base.filter((p) => p.visit_count === 0).length,
    }),
    [base],
  )
  const distanceOf = useCallback(
    (p: Point) => (here && p.lng && p.lat ? haversine(here.lng, here.lat, p.lng, p.lat) : null),
    [here],
  )
  const visible = useMemo(() => {
    const list = base.filter((p) => matchScope(p, scope))
    if (sort === 'near' && here) return list.sort((a, b) => (distanceOf(a) ?? Infinity) - (distanceOf(b) ?? Infinity))
    return list.sort((a, b) => latestTs(b) - latestTs(a))
  }, [base, scope, sort, here, distanceOf])
  const facets = useMemo(() => facetsOf(points), [points])
  const multiAuthor = useMemo(() => facets.authorList.some((a) => a.u !== myUsername), [facets, myUsername])

  /** 切到「离我近」要先定位；没定位成功返回 false，排序不变 */
  async function sortNear() {
    const loc = await getMyLocation()
    if (!loc) return false
    setHere(loc)
    setSort('near')
    return true
  }

  function toggleFilter<K extends keyof Filters>(key: K, value: Filters[K][number]) {
    setFilters((f) => {
      const cur = f[key] as Filters[K][number][]
      return { ...f, [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] }
    })
  }

  return {
    points,
    loading,
    loadError,
    reload,
    scope,
    setScope,
    filters,
    toggleFilter,
    clearFilters,
    query,
    setQuery,
    sort,
    setSort,
    sortNear,
    distanceOf,
    base,
    counts,
    visible,
    facets,
    multiAuthor,
    activeCount: filterCount(filters) + (query.trim() ? 1 : 0),
  }
}

export type Browse = ReturnType<typeof useBrowse>
