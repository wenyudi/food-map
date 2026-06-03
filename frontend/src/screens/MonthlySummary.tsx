import { useEffect, useMemo, useState } from 'react'
import Icon from '../ui/Icon'
import { getMonthlyStory } from '../api'
import type { Point, Visit } from '../api'
import { cleanTag } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'

type Props = Readonly<{ points: Point[]; refreshKey: number }>

/** 本月小结：可折叠；展开后加载 AI 写的本月回忆 */
export default function MonthlySummary({ points, refreshKey }: Props) {
  const data = useMemo(() => {
    const now = new Date()
    const thisMonth = now.toISOString().slice(0, 7)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7)
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
    try {
      const r = await getMonthlyStory(data.yearMonth, regenerate)
      setStory(r.story || '')
    } catch {
      /* ignore */
    } finally {
      setStoryLoading(false)
    }
  }

  useEffect(() => {
    if (!collapsed && data.visitCount > 0 && !story) loadStory(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, data.yearMonth, data.visitCount, refreshKey])

  if (data.visitCount === 0 && data.wishCount === 0) return null

  // 折叠态：紧凑一行
  if (collapsed) {
    return (
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between rounded-xl border-2 border-on-surface bg-white shadow-sticker-sm px-3 py-2.5 mb-3 press-sm"
      >
        <span className="flex items-center gap-2 font-bold text-sm">
          <Icon name="bar_chart" className="text-primary text-xl" />
          本月 · <b>{cVisit}</b> 次 · <b>¥{cSpent}</b>
          {data.topTag && (
            <>
              · 最爱 <b className="text-primary">{data.topTag}</b>
            </>
          )}
        </span>
        <Icon name="expand_more" className="text-on-surface-variant" />
      </button>
    )
  }

  // 展开态
  const delta = data.visitCount - data.lastCount
  const deltaTxt = data.lastCount === 0 ? '' : delta > 0 ? `↑ 上月 ${data.lastCount}` : delta < 0 ? `↓ 上月 ${data.lastCount}` : '= 上月'

  return (
    <div className="rounded-xl border-2 border-on-surface bg-white shadow-sticker-sm p-3 mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1 font-headline text-lg">
          <Icon name="bar_chart" className="text-primary" /> 本月小结
        </span>
        <button onClick={toggle} className="text-on-surface-variant text-sm font-bold flex items-center gap-1">
          {data.label} <Icon name="expand_less" />
        </button>
      </div>

      <div className="flex gap-2">
        <Cell value={String(cVisit)} label="次出门" sub={deltaTxt} />
        <Cell value={`¥${cSpent}`} label="总花费" />
        {data.topTag && <Cell value={data.topTag} label="最常吃" />}
        {data.fulfilled > 0 && <Cell value={String(cFulfilled)} label="兑现 ✨" />}
      </div>

      {data.visitCount > 0 && (
        <div className="mt-3 pt-3 border-t-2 border-dashed border-on-surface/15">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold text-primary flex items-center gap-1">
              <Icon name="auto_awesome" className="text-accent text-base" /> AI 写的本月回忆
            </span>
            <button onClick={() => loadStory(true)} disabled={storyLoading} className="text-on-surface-variant press-sm">
              <Icon name="autorenew" className={'text-base' + (storyLoading ? ' animate-spin' : '')} />
            </button>
          </div>
          {storyLoading && !story ? (
            <div className="space-y-1.5">
              <div className="h-3 bg-on-surface/10 rounded animate-pulse" />
              <div className="h-3 w-4/5 bg-on-surface/10 rounded animate-pulse" />
            </div>
          ) : (
            story && <p className={`text-sm leading-relaxed text-on-surface ${storyLoading ? 'opacity-50' : ''}`}>{story}</p>
          )}
        </div>
      )}
    </div>
  )
}

function Cell({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-0 text-center">
      <div className="font-num font-bold text-xl text-primary leading-none truncate">{value}</div>
      <div className="text-[11px] font-bold text-on-surface-variant mt-1">{label}</div>
      {sub && <div className="text-[10px] text-on-surface-variant/70">{sub}</div>}
    </div>
  )
}
