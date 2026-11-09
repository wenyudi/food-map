import { useEffect, useMemo, useRef, useState } from 'react'
import { search, poiDetail } from '../api'
import type { Point } from '../api'
import { cleanTag, inputClass } from '../lib/format'
import OpenHours from './OpenHours'
import Icon from '../ui/Icon'

/** 店名归一化（与后端 amap._norm_name 同规则：去空格/分隔符 + 小写），本地模糊匹配用 */
const norm = (s: string) => (s || '').replace(/[\s·・.\-—()（）]/g, '').toLowerCase()

/** 本圈子店点 → poi 形状（与 AddScreen.recordNearby 的构造一致），选中即可直接进录入态 */
function pointToPoi(p: Point): any {
  return {
    id: p.poi_id,
    name: p.name,
    location: p.lng && p.lat ? `${p.lng},${p.lat}` : '',
    business: { tag: p.tag, rating: p.rating, cost: p.cost, business_area: p.business_area },
    pname: '',
    cityname: p.city || '',
    adname: p.district || p.business_area || '',
    address: p.address || '',
  }
}

type StoreSearchBoxProps = Readonly<{
  city: string
  /** "lng,lat"，仅用于远端结果按距离排序 */
  location?: string
  /** 本圈子店点：名称模糊命中置顶，带「来过 N 次 / 想去」徽章 */
  localPoints?: Point[]
  initialQuery?: string
  /** 打开时预置的候选（如 AI 解析时已搜到的）；用户重搜后被替换 */
  initialResults?: any[]
  autoFocus?: boolean
  placeholder?: string
  /** 选中候选。inputtips 来源（缺 business 字段）会先补一次详情再回调，失败静默降级 */
  onPick: (poi: any) => void
  /** 空态出口（如「手动加这家店」）；不传则空态只显示提示文案 */
  emptyActionLabel?: string
  onEmptyAction?: (query: string) => void
}>

export default function StoreSearchBox({
  city,
  location,
  localPoints,
  initialQuery = '',
  initialResults,
  autoFocus = false,
  placeholder = '输入店名搜一搜',
  onPick,
  emptyActionLabel,
  onEmptyAction,
}: StoreSearchBoxProps) {
  const [q, setQ] = useState(initialQuery)
  const [dirty, setDirty] = useState(false) // 用户改过词才自动搜，初始词不重复打接口
  const [remote, setRemote] = useState<any[] | null>(null) // null=还没远端搜过
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const seq = useRef(0) // 防竞态：快速输入时旧响应晚到不能覆盖新结果

  async function runSearch(kw: string) {
    const mySeq = ++seq.current
    setBusy(true)
    setErr(null)
    try {
      const r = await search(kw, city, location, 'name')
      if (mySeq === seq.current) setRemote(r)
    } catch {
      if (mySeq === seq.current) setErr('搜索开小差了，稍等再试')
    } finally {
      if (mySeq === seq.current) setBusy(false)
    }
  }

  // 边打边搜：防抖 400ms，≥2 字才发起
  useEffect(() => {
    const kw = q.trim()
    if (!dirty || kw.length < 2) return
    const t = setTimeout(() => runSearch(kw), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, dirty, city, location])

  // 本地命中：即时、零请求
  const localHits = useMemo(() => {
    const k = norm(q)
    if (!k || !localPoints?.length) return []
    return localPoints.filter((p) => norm(p.name).includes(k)).slice(0, 5)
  }, [q, localPoints])

  const localIds = useMemo(() => new Set(localHits.map((p) => p.poi_id)), [localHits])
  const displayRemote = (remote ?? initialResults ?? []).filter((p) => !localIds.has(p?.id))
  // 空态：远端搜过（或带着空的预置候选进来）且本地也没命中
  const attempted = remote !== null || initialResults !== undefined
  const showEmpty = !busy && attempted && localHits.length === 0 && displayRemote.length === 0 && q.trim().length >= 1

  async function pick(p: any, isLocal: boolean) {
    if (picking) return
    const hasBiz = p.business && (p.business.rating || p.business.tag || p.business.cost)
    // 本地店 / 手动店 / 已带 business 的候选直接回调；inputtips 来源先补详情
    if (isLocal || hasBiz || !p.id || String(p.id).startsWith('m_')) {
      onPick(p)
      return
    }
    setPicking(p.id)
    try {
      const d = await poiDetail(p.id)
      onPick({ ...p, ...d, business: { ...(p.business || {}), ...(d.business || {}) } })
    } catch {
      onPick(p) // 详情没取到不挡录入，字段留空（与手动店同等待遇）
    } finally {
      setPicking(null)
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setDirty(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && q.trim().length >= 2) runSearch(q.trim())
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          enterKeyHint="search"
          className={inputClass + ' flex-1 min-w-0'}
        />
        <button
          disabled={busy || q.trim().length < 2}
          onClick={() => runSearch(q.trim())}
          aria-label="搜索"
          className={`shrink-0 w-12 rounded-2xl flex items-center justify-center press-sm ${
            busy || q.trim().length >= 2 ? 'bg-primary text-white shadow-glow' : 'bg-surface-2 text-on-surface-variant/60'
          }`}
        >
          {busy ? <span className="w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin" /> : <Icon name="search" />}
        </button>
      </div>

      {(localHits.length > 0 || displayRemote.length > 0) && (
        <div className="flex flex-col gap-2 mt-3 max-h-[45vh] overflow-y-auto -mx-1 px-1 pb-1">
          {localHits.map((p, i) => (
            <button
              key={p.poi_id}
              onClick={() => pick(pointToPoi(p), true)}
              className="stagger text-left rounded-2xl bg-primary-soft/70 px-3.5 py-3 press"
              style={{ '--i': i } as React.CSSProperties}
            >
              <div className="font-semibold flex items-center gap-2 min-w-0">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white text-primary-dark">
                  {p.visit_count > 0 ? `📍 来过 ${p.visit_count} 次` : '🌱 想去'}
                </span>
              </div>
              <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                {[p.business_area, p.address].filter(Boolean).join(' · ') || '你们记过的店'}
              </div>
            </button>
          ))}
          {displayRemote.map((p, i) => (
            <button
              key={p.id}
              onClick={() => pick(p, false)}
              disabled={!!picking}
              className="stagger text-left rounded-2xl bg-white shadow-soft ring-1 ring-line px-3.5 py-3 press disabled:opacity-60"
              style={{ '--i': i + localHits.length } as React.CSSProperties}
            >
              <div className="font-semibold flex items-center gap-2">
                <span className="truncate">{p.name}</span>
                {picking === p.id && <span className="shrink-0 w-3.5 h-3.5 rounded-full border-2 border-primary border-r-transparent animate-spin" />}
              </div>
              <div className="text-xs text-on-surface-variant mt-0.5">
                {[cleanTag(p.business?.tag), p.business?.rating && `⭐${p.business.rating}`, p.business?.cost && `¥${p.business.cost}/人`]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <OpenHours opentime={p.business?.opentime_today || p.business?.opentime_week} className="mt-0.5" />
              <div className="text-xs text-on-surface-variant/80 mt-0.5 truncate">
                {[p.adname, p.address].filter(Boolean).join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}

      {showEmpty && (
        <div className="text-center text-on-surface-variant text-sm py-6 animate-fade-up">
          <div className="text-3xl mb-2">🔍</div>
          没搜到「{q.trim()}」
          <br />
          换个关键词试试{onEmptyAction ? '，或者：' : ''}
          {onEmptyAction && (
            <button onClick={() => onEmptyAction(q.trim())} className="block mx-auto mt-3 rounded-full bg-primary-soft text-primary-dark font-semibold px-4 py-2 press-sm">
              {emptyActionLabel || '✍️ 手动加这家店'}
            </button>
          )}
        </div>
      )}

      {err && <div className="text-primary-dark text-sm bg-primary-soft rounded-2xl px-3.5 py-2.5 mt-2 animate-fade-up">{err}</div>}
    </div>
  )
}
