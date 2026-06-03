import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TopBar, { Avatar } from '../ui/TopBar'
import Icon from '../ui/Icon'
import AskSheet from './AskSheet'
import EditRecordSheet from './EditRecordSheet'
import MonthlySummary from './MonthlySummary'
import { getPoints } from '../api'
import type { Point, Wish, Visit } from '../api'
import { cleanTag } from '../lib/format'

type FilterKey = 'all' | 'fav' | 'want' | 'fulfilled' | 'repeat'
type EditTarget = { kind: 'visit' | 'wish'; data: any; storeName: string }
type StoreStatus = { key: 'want' | 'fulfilled' | 'repeat' | 'direct'; icon: string; label: string }
type TimelineEvent = { type: 'wish'; date: string; data: Wish } | { type: 'visit'; date: string; data: Visit }

function getStatus(p: Point): StoreStatus {
  if (p.visit_count === 0) return { key: 'want', icon: '❤️', label: '种草中' }
  if (p.visit_count >= 2) return { key: 'repeat', icon: '🔁', label: '二刷' }
  if (p.wish != null) return { key: 'fulfilled', icon: '✨', label: '已兑现' }
  return { key: 'direct', icon: '📍', label: '直奔' }
}
function buildTimeline(p: Point): TimelineEvent[] {
  const events: TimelineEvent[] = []
  if (p.wish) events.push({ type: 'wish', date: (p.wish.created_at || '').slice(0, 10), data: p.wish })
  p.visits.forEach((v) => events.push({ type: 'visit', date: v.date, data: v }))
  return events.sort((a, b) => a.date.localeCompare(b.date))
}
function latestTs(p: Point): number {
  const visits = p.visits.map((v) => Date.parse(v.date) || 0)
  const wishTs = p.wish ? Date.parse(p.wish.created_at) || 0 : 0
  return Math.max(0, wishTs, ...visits)
}
function prettyDate(s?: string): string {
  if (!s) return ''
  const d = s.slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)
  if (d === today) return '今天'
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (d === yesterday) return '昨天'
  if (d.slice(0, 4) === today.slice(0, 4)) return d.slice(5).replace('-', '/')
  return d.replace(/-/g, '/')
}
function buildShareText(p: Point): string {
  const lines: string[] = [`📍「${p.name}」`]
  const meta = [p.business_area, cleanTag(p.tag), p.cost && `人均¥${p.cost}`].filter(Boolean).join(' · ')
  if (meta) lines.push(meta)
  const lastVisit = [...p.visits].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
  if (lastVisit) lines.push([lastVisit.mood_emoji, lastVisit.feeling].filter(Boolean).join(' ') || '我记过一笔')
  else if (p.wish?.reason) lines.push(`想去：${p.wish.reason}`)
  lines.push('—— 来自我的美食地图')
  return lines.join('\n')
}

const STATUS_TONE: Record<StoreStatus['key'], string> = {
  want: 'bg-white text-primary',
  repeat: 'bg-accent text-on-surface',
  fulfilled: 'bg-green-accent text-white',
  direct: 'bg-white text-on-surface-variant',
}

type ListScreenProps = Readonly<{
  refreshKey: number
  focusPoiId?: string | null
  onPickStore?: (poiId: string) => void
  onJumpToAdd?: () => void
  myUsername?: string
}>

export default function ListScreen({ refreshKey, focusPoiId, onPickStore, onJumpToAdd, myUsername }: ListScreenProps) {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [query, setQuery] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const load = useCallback(() => {
    setLoading(true)
    getPoints().then(setPoints).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    load()
  }, [load, refreshKey])

  const multiAuthor = useMemo(() => {
    const set = new Set<string>()
    points.forEach((p) => {
      p.visits.forEach((v) => v.recorded_by && set.add(v.recorded_by))
      if (p.wish?.recorded_by) set.add(p.wish.recorded_by)
    })
    return set.size > 1
  }, [points])

  const { filtered, counts } = useMemo(() => {
    const c = { all: points.length, fav: 0, want: 0, fulfilled: 0, repeat: 0 }
    const enriched = points.map((p) => {
      const status = getStatus(p)
      if (status.key === 'want') c.want++
      else if (status.key === 'fulfilled') c.fulfilled++
      else if (status.key === 'repeat') c.repeat++
      if (p.visits.some((v) => v.want_again)) c.fav++
      return { p, status }
    })
    let result = enriched
    if (filter === 'fav') result = result.filter((e) => e.p.visits.some((v) => v.want_again))
    else if (filter !== 'all') result = result.filter((e) => e.status.key === filter)
    const q = query.trim().toLowerCase()
    if (q) result = result.filter((e) => e.p.name.toLowerCase().includes(q))
    result.sort((a, b) => latestTs(b.p) - latestTs(a.p))
    return { filtered: result, counts: c }
  }, [points, filter, query])

  useEffect(() => {
    if (!focusPoiId || loading) return
    const inFiltered = filtered.find((e) => e.p.poi_id === focusPoiId)
    if (!inFiltered && filter !== 'all') {
      setFilter('all')
      return
    }
    const t = setTimeout(() => {
      const el = cardRefs.current[focusPoiId]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setFlashId(focusPoiId)
        setTimeout(() => setFlashId(null), 2000)
      }
    }, 60)
    return () => clearTimeout(t)
  }, [focusPoiId, filtered, filter, loading])

  async function shareStore(p: Point) {
    const text = buildShareText(p)
    try {
      if (navigator.share) await navigator.share({ title: p.name, text })
      else {
        await navigator.clipboard.writeText(text)
        setToast('已复制，粘贴给朋友吧 📋')
        setTimeout(() => setToast(null), 1800)
      }
    } catch {
      /* 用户取消 */
    }
  }

  const FILTERS: { key: FilterKey; label: string; icon?: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'fav', label: '想再来', icon: 'star' },
    { key: 'want', label: '想去', icon: 'favorite' },
    { key: 'fulfilled', label: '已兑现', icon: 'auto_awesome' },
    { key: 'repeat', label: '二刷', icon: 'replay' },
  ]

  return (
    <div className="h-full flex flex-col">
      <TopBar subtitle="你俩一起吃过的好味道" right={<Avatar emoji="🤤" />} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-4 pb-6">
        <h2 className="font-headline text-3xl mb-3">食光清单</h2>

        {/* 搜索 + 问地图 */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 rounded-full border-2 border-on-surface bg-white px-4 py-2.5 shadow-sticker-sm">
            <Icon name="search" className="text-on-surface-variant text-xl" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜店名…"
              className="flex-1 min-w-0 bg-transparent outline-none font-body text-on-surface placeholder:text-on-surface-variant/60"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-on-surface-variant">
                <Icon name="close" className="text-lg" />
              </button>
            )}
          </div>
          <button
            onClick={() => setAskOpen(true)}
            className="shrink-0 bg-primary text-white rounded-full border-2 border-on-surface shadow-sticker px-4 flex items-center gap-1 press font-headline font-bold"
          >
            <Icon name="forum" className="text-lg" />
            问地图
          </button>
        </div>

        {/* 月度小结 */}
        <MonthlySummary points={points} refreshKey={refreshKey} />

        {/* 筛选 chips */}
        {points.length > 0 && (
          <div className="flex gap-2 my-3 overflow-x-auto hide-scrollbar">
            {FILTERS.map((f) => {
              const n = counts[f.key]
              const active = filter === f.key
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-on-surface text-sm font-bold shadow-sticker-sm press-sm ${
                    active ? 'bg-primary text-white' : 'bg-white text-on-surface-variant'
                  }`}
                >
                  {f.icon && <Icon name={f.icon} className="text-base" />}
                  {f.label} <em className="not-italic opacity-70">{n}</em>
                </button>
              )
            })}
          </div>
        )}

        {loading && <ListSkeleton />}

        {!loading && points.length === 0 && (
          <div className="flex flex-col items-center text-center py-16">
            <div className="text-5xl mb-2">🍜</div>
            <div className="font-headline text-xl mb-1">还没有记录</div>
            <div className="text-sm text-on-surface-variant mb-4">记下第一家店，这里就会热闹起来</div>
            {onJumpToAdd && (
              <button
                onClick={onJumpToAdd}
                className="bg-primary text-white rounded-full border-2 border-on-surface shadow-sticker px-5 py-2.5 font-headline font-bold press"
              >
                ✏️ 去记第一笔
              </button>
            )}
          </div>
        )}

        {!loading && points.length > 0 && filtered.length === 0 && (
          <div className="text-center text-on-surface-variant py-10 text-sm">
            {query.trim() ? `没搜到「${query.trim()}」` : '这个分类下还没有 🍃'}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {!loading &&
            filtered.map(({ p, status }) => (
              <StoreCard
                key={p.poi_id}
                point={p}
                status={status}
                flashing={flashId === p.poi_id}
                cardRef={(el) => {
                  cardRefs.current[p.poi_id] = el
                }}
                onClick={() => onPickStore?.(p.poi_id)}
                onEdit={setEditing}
                onShare={() => shareStore(p)}
                showAuthor={multiAuthor}
                myUsername={myUsername}
              />
            ))}
        </div>
      </div>

      {editing && (
        <EditRecordSheet
          kind={editing.kind}
          data={editing.data}
          storeName={editing.storeName}
          onClose={() => setEditing(null)}
          onChanged={load}
        />
      )}
      {askOpen && <AskSheet onClose={() => setAskOpen(false)} />}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[150] bg-on-surface text-white rounded-full px-4 py-2 text-sm font-bold shadow-sticker">
          {toast}
        </div>
      )}
    </div>
  )
}

function StoreCard({
  point,
  status,
  flashing,
  cardRef,
  onClick,
  onEdit,
  onShare,
  showAuthor,
  myUsername,
}: {
  point: Point
  status: StoreStatus
  flashing: boolean
  cardRef: (el: HTMLDivElement | null) => void
  onClick?: () => void
  onEdit: (t: EditTarget) => void
  onShare: () => void
  showAuthor: boolean
  myUsername?: string
}) {
  const timeline = buildTimeline(point)
  const headEmoji = point.visit_count > 0 ? point.emoji : '❤️'
  const isManual = String(point.poi_id).startsWith('m_')
  const hasCoords = !!(point.lng && point.lat)

  return (
    <div
      ref={cardRef}
      className={`sticker p-3 transition-shadow ${flashing ? 'ring-4 ring-accent' : ''}`}
    >
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-full border-2 border-on-surface bg-white flex items-center justify-center text-xl shrink-0">
          {headEmoji}
        </span>
        <button className="flex-1 min-w-0 text-left" onClick={hasCoords ? onClick : undefined}>
          <div className="font-headline text-lg leading-tight">
            {point.name}
            {isManual && <span className="ml-1 text-[10px] font-bold text-on-surface-variant align-middle">手动</span>}
          </div>
          <div className="text-xs font-bold text-on-surface-variant truncate">
            {[point.business_area, cleanTag(point.tag), point.rating && `⭐${point.rating}`, point.cost && `¥${point.cost}/人`]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </button>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border-2 border-on-surface text-xs font-bold shadow-sticker-sm ${STATUS_TONE[status.key]}`}
        >
          {status.icon} {status.label}
        </span>
      </div>

      {/* 时间线 */}
      <div className="mt-2 pl-1 flex flex-col gap-2">
        {timeline.map((e, i) => (
          <TimelineRow
            key={i}
            event={e}
            onEdit={() => onEdit({ kind: e.type, data: e.data, storeName: point.name })}
            showAuthor={showAuthor}
            myUsername={myUsername}
          />
        ))}
      </div>

      {/* 底部 */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t-2 border-dashed border-on-surface/15">
        <button onClick={hasCoords ? onClick : undefined} className="text-xs font-bold text-on-surface-variant">
          {hasCoords ? '看在地图上 →' : '📍 未定位'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onShare()
          }}
          className="text-xs font-bold text-primary flex items-center gap-0.5"
        >
          <Icon name="ios_share" className="text-sm" /> 分享
        </button>
      </div>
    </div>
  )
}

function TimelineRow({
  event,
  onEdit,
  showAuthor,
  myUsername,
}: {
  event: TimelineEvent
  onEdit: () => void
  showAuthor: boolean
  myUsername?: string
}) {
  const by = event.data.recorded_by
  const authorTag =
    showAuthor && by ? (
      <span className="text-[10px] font-bold text-on-surface-variant bg-surface rounded px-1">
        {by === myUsername ? '你记的' : `${by} 记的`}
      </span>
    ) : null

  if (event.type === 'wish') {
    const w = event.data
    return (
      <div className="flex gap-2 items-start group">
        <span className="text-lg shrink-0">❤️</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-on-surface-variant flex flex-wrap items-center gap-1">
            {prettyDate(w.created_at)} · {w.source}种草
            {w.status === 'visited' && (
              <span className="bg-green-accent/15 text-green-accent rounded px-1">已兑现</span>
            )}
            {authorTag}
          </div>
          {w.reason && <div className="text-sm">{w.reason}</div>}
        </div>
        <button onClick={onEdit} className="shrink-0 text-on-surface-variant opacity-60">
          <Icon name="edit" className="text-base" />
        </button>
      </div>
    )
  }

  const v = event.data
  const photos = (v.my_photos || '').split('|').filter(Boolean)
  return (
    <div className="flex gap-2 items-start">
      <span className="text-lg shrink-0">{v.mood_emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-on-surface-variant flex flex-wrap items-center gap-1">
          {prettyDate(v.date)} {v.meal_period}
          {v.wish_id && <span className="bg-primary/15 text-primary rounded px-1">兑现 ✨</span>}
          {!!v.want_again && <span>⭐</span>}
          {authorTag}
        </div>
        <div className="text-xs text-on-surface-variant">
          {[v.companions, `¥${v.per_person}/人`, v.value_label].filter(Boolean).join(' · ')}
        </div>
        {v.feeling && <div className="text-sm">{v.feeling}</div>}
        {photos.length > 0 && (
          <div className="flex gap-1.5 mt-1.5">
            {photos.slice(0, 4).map((u) => (
              <img key={u} src={u} className="zoomable w-16 h-16 object-cover rounded-lg border-2 border-on-surface" />
            ))}
          </div>
        )}
      </div>
      <button onClick={onEdit} className="shrink-0 text-on-surface-variant opacity-60">
        <Icon name="edit" className="text-base" />
      </button>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="sticker p-3 animate-pulse">
          <div className="flex gap-3">
            <div className="w-11 h-11 rounded-full bg-on-surface/10" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 w-2/3 bg-on-surface/10 rounded" />
              <div className="h-2 w-1/3 bg-on-surface/10 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
