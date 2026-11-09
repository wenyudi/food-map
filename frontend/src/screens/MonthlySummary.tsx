import { useEffect, useMemo, useState } from 'react'
import Icon from '../ui/Icon'
import { getMonthlyStory } from '../api'
import type { Point, Visit } from '../api'
import { cleanTag, localDate } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'

type Props = Readonly<{ points: Point[]; refreshKey: number }>

/** 本月小结：可折叠；展开后加载 AI 写的本月回忆 */
export default function MonthlySummary({ points, refreshKey }: Props) {
  const data = useMemo(() => {
    const now = new Date()
    const thisMonth = localDate(now).slice(0, 7)
    const lastMonth = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7)
    const thisVisits: Array<Visit & { tag?: string }> = []
    let lastCount = 0
    for (const p of points) {
      for (const v of p.visits) {
        if (v.date.startsWith(thisMonth)) thisVisits.push({ ...v, tag: p.tag })
        else if (v.date.startsWith(lastMonth)) lastCount++
      }
    }
    const totalSpent = thisVisits.reduce((s, v) => s + Number(v.amount || 0), 0)
    const wishCount = points.filter((p) => p.wish && p.wish.status === 'want').length
    const fulfilled = thisVisits.filter((v) => v.wish_id).length
    const tagCount: Record<string, number> = {}
    thisVisits.forEach((v) => {
      const t = cleanTag(v.tag, 1)
      if (t) tagCount[t] = (tagCount[t] || 0) + 1
    })
    const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]?.[0]
    return {
      yearMonth: thisMonth,
      label: thisMonth.replace('-', '/'),
      visitCount: thisVisits.length,
      lastCount,
      totalSpent,
      topTag,
      wishCount,
      fulfilled,
    }
  }, [points])

  const cVisit = Math.round(useCountUp(data.visitCount))
  const cSpent = Math.round(useCountUp(data.totalSpent))
  const cFulfilled = Math.round(useCountUp(data.fulfilled))

  const lsKey = `ms_collapsed_${data.yearMonth}`
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(lsKey) !== 'open')
  const [story, setStory] = useState('')
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState(false)

  useEffect(() => {
    if (refreshKey === 0) return
    try {
      localStorage.removeItem(lsKey)
    } catch {}
    setCollapsed(false)
  }, [refreshKey, lsKey])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        if (next) localStorage.removeItem(lsKey)
        else localStorage.setItem(lsKey, 'open')
      } catch {}
      return next
    })
  }

  async function loadStory(regenerate = false) {
    if (data.visitCount === 0) return
    setStoryLoading(true)
    setStoryError(false)
    try {
      const r = await getMonthlyStory(data.yearMonth, regenerate)
      setStory(r.story || '')
    } catch {
      setStoryError(true)  // 区分「还没生成」和「没加载出来」，给个手动重试入口
    } finally {
      setStoryLoading(false)
    }
  }

  useEffect(() => {
    if (!collapsed && data.visitCount > 0 && !story) loadStory(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, data.yearMonth, data.visitCount, refreshKey])

  if (data.visitCount === 0 && data.wishCount === 0) return null

  const delta = data.visitCount - data.lastCount
  const deltaTxt = data.lastCount === 0 ? '' : delta > 0 ? `↑ 上月 ${data.lastCount}` : delta < 0 ? `↓ 上月 ${data.lastCount}` : '= 上月'

  // 折叠 / 展开共用一张卡：头部一行常驻，详情用 grid 0fr→1fr 平滑展开
  return (
    <div className="card overflow-hidden">
      <button onClick={toggle} aria-expanded={!collapsed} className="w-full flex items-center justify-between gap-2 px-4 py-3.5 text-left press-sm">
        <span className="flex items-center gap-2.5 min-w-0">
          <span className="w-8 h-8 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
            <Icon name="bar_chart" className="text-primary text-[19px]" />
          </span>
          {collapsed ? (
            <span className="text-sm truncate">
              {data.visitCount === 0 ? (
                `这个月还没开张${data.lastCount ? ` · 上月吃了 ${data.lastCount} 顿` : ''}`
              ) : (
                <>
              本月 <b className="font-num font-semibold">{cVisit}</b> 次 · <b className="font-num font-semibold">¥{cSpent}</b>
              {data.topTag && (
                <>
                  {' '}
                  · 最爱 <b className="text-primary-dark font-semibold">{data.topTag}</b>
                </>
              )}
                </>
              )}
            </span>
          ) : (
            <span className="text-[15px] font-bold">本月小结</span>
          )}
        </span>
        <span className="flex items-center gap-1 text-xs text-on-surface-variant shrink-0">
          {!collapsed && <span className="font-num">{data.label}</span>}
          <Icon name="expand_more" className={`transition-transform duration-500 ease-spring ${collapsed ? '' : 'rotate-180'}`} />
        </span>
      </button>

      <div className={`grid transition-[grid-template-rows] duration-500 ease-out-expo ${collapsed ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className={`px-4 pb-4 transition-opacity duration-300 ${collapsed ? 'opacity-0' : 'opacity-100 delay-100'}`}>
            <div className="flex rounded-2xl bg-surface-2/70 py-3">
              <Cell value={String(cVisit)} label="次出门" sub={deltaTxt} />
              <Cell value={`¥${cSpent}`} label="总花费" />
              {data.topTag && <Cell value={data.topTag} label="最常吃" />}
              {data.fulfilled > 0 && <Cell value={String(cFulfilled)} label="兑现 ✨" />}
            </div>

            {data.visitCount > 0 && (
              <div className="mt-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-semibold text-primary-dark flex items-center gap-1">
                    <Icon name="auto_awesome" filled className="text-accent text-base" /> AI 写的本月回忆
                  </span>
                  <button onClick={() => loadStory(true)} disabled={storyLoading} aria-label="重写回忆" className="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-2 press-sm">
                    <Icon name="autorenew" className={'text-base' + (storyLoading ? ' animate-spin' : '')} />
                  </button>
                </div>
                {storyLoading && !story ? (
                  <div className="space-y-2">
                    <div className="skeleton h-3" />
                    <div className="skeleton h-3 w-4/5" />
                  </div>
                ) : story ? (
                  <p key={story} className={`text-sm leading-relaxed text-on-surface/90 text-pretty animate-fade-in ${storyLoading ? 'opacity-50' : ''}`}>
                    {story}
                  </p>
                ) : storyError ? (
                  <button onClick={() => loadStory(false)} className="text-sm text-on-surface-variant underline underline-offset-4 press-sm">
                    回忆没加载出来，点一下重试
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-0 text-center px-1 [&+&]:border-l [&+&]:border-line">
      <div className="font-num font-semibold text-xl text-on-surface leading-none truncate tabular-nums">{value}</div>
      <div className="text-[11px] text-on-surface-variant mt-1.5">{label}</div>
      {sub && <div className="text-[10px] text-on-surface-variant/70 mt-0.5">{sub}</div>}
    </div>
  )
}
