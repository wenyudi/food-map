import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'
import AskSheet from './AskSheet'
import EditRecordSheet from './EditRecordSheet'
import { getPoints } from '../api'
import type { Point, Wish, Visit } from '../api'
import { cleanTag } from '../lib/format'

type Mood = '😋' | '🤤' | '😂' | '😐' | '🤮'
const MOODS: Mood[] = ['😋', '🤤', '😂', '😐', '🤮']
const MOOD_LABEL: Record<Mood, string> = { '😋': '太好吃', '🤤': '好吃', '😂': '一般', '😐': '不咋地', '🤮': '踩雷' }
type StatusKey = 'fav' | 'want' | 'fulfilled' | 'repeat'
const STATUS_OPTS: { key: StatusKey; label: string; icon: string }[] = [
  { key: 'fav', label: '想再来', icon: 'star' },
  { key: 'want', label: '想去', icon: 'favorite' },
  { key: 'fulfilled', label: '已兑现', icon: 'auto_awesome' },
  { key: 'repeat', label: '二刷', icon: 'replay' },
]
/** 多维筛选：维度内多选(OR)，跨维度 AND；空 = 不筛 */
type Filters = { moods: Mood[]; status: StatusKey[]; cuisines: string[] }
type EditTarget = { kind: 'visit' | 'wish'; data: any; storeName: string }
type StoreStatus = { key: 'want' | 'fulfilled' | 'repeat' | 'direct'; icon: string; label: string }
type TimelineEvent = { type: 'wish'; date: string; data: Wish } | { type: 'visit'; date: string; data: Visit }

function getStatus(p: Point): StoreStatus {
  if (p.visit_count === 0) return { key: 'want', icon: '❤️', label: '种草中' }
  if (p.visit_count >= 2) return { key: 'repeat', icon: '🔁', label: '二刷' }
  if (p.wish != null) return { key: 'fulfilled', icon: '✨', label: '已兑现' }
  return { key: 'direct', icon: '📍', label: '直奔' }
}
/** 某店是否命中某个「状态」筛选项 */
function matchStatus(p: Point, key: StatusKey): boolean {
  if (key === 'fav') return p.visits.some((v) => v.want_again)
  return getStatus(p).key === key
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
  want: 'bg-tertiary text-on-surface',
  repeat: 'bg-accent text-on-surface',
  fulfilled: 'bg-green-accent text-white',
  direct: 'bg-white text-on-surface-variant',
}
// 卡片底色按状态微微上色（让列表更有颜色，与状态标签同色系）
const STATUS_CARD: Record<StoreStatus['key'], string> = {
  want: 'bg-tertiary/30',
  repeat: 'bg-accent/20',
  fulfilled: 'bg-green-accent/15',
  direct: 'bg-white',
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
  const [filters, setFilters] = useState<Filters>({ moods: [], status: [], cuisines: [] })
  const [filterOpen, setFilterOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [askOpen, setAskOpen] = useState(false)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const activeCount = filters.moods.length + filters.status.length + filters.cuisines.length
  const toggleMood = (m: Mood) =>
    setFilters((f) => ({ ...f, moods: f.moods.includes(m) ? f.moods.filter((x) => x !== m) : [...f.moods, m] }))
  const toggleStatus = (s: StatusKey) =>
    setFilters((f) => ({ ...f, status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s] }))
  const toggleCuisine = (c: string) =>
    setFilters((f) => ({ ...f, cuisines: f.cuisines.includes(c) ? f.cuisines.filter((x) => x !== c) : [...f.cuisines, c] }))
  const clearFilters = () => setFilters({ moods: [], status: [], cuisines: [] })

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

  const { filtered, moodCount, statusCount, cuisineList } = useMemo(() => {
    // 各维度选项的全局计数（独立于当前选择）
    const moodCount: Record<string, number> = {}
    const statusCount: Record<string, number> = {}
    const cuisineCount: Record<string, number> = {}
    MOODS.forEach((m) => (moodCount[m] = 0))
    STATUS_OPTS.forEach((s) => (statusCount[s.key] = 0))
    points.forEach((p) => {
      MOODS.forEach((m) => {
        if (p.visits.some((v) => v.mood_emoji === m)) moodCount[m]++
      })
      STATUS_OPTS.forEach((s) => {
        if (matchStatus(p, s.key)) statusCount[s.key]++
      })
      const t = cleanTag(p.tag, 1)
      if (t) cuisineCount[t] = (cuisineCount[t] || 0) + 1
    })
    const cuisineList = Object.entries(cuisineCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => ({ name, n }))

    // 应用筛选：维度内 OR、跨维度 AND
    let result = points.filter((p) => {
      if (filters.moods.length && !filters.moods.some((m) => p.visits.some((v) => v.mood_emoji === m))) return false
      if (filters.status.length && !filters.status.some((s) => matchStatus(p, s))) return false
      if (filters.cuisines.length && !filters.cuisines.includes(cleanTag(p.tag, 1))) return false
      return true
    })
    const q = query.trim().toLowerCase()
    if (q) result = result.filter((p) => p.name.toLowerCase().includes(q))
    const enriched = result
      .sort((a, b) => latestTs(b) - latestTs(a))
      .map((p) => ({ p, status: getStatus(p) }))
    return { filtered: enriched, moodCount, statusCount, cuisineList }
  }, [points, filters, query])

  useEffect(() => {
    if (!focusPoiId || loading) return
    const inFiltered = filtered.find((e) => e.p.poi_id === focusPoiId)
    if (!inFiltered && activeCount > 0) {
      clearFilters()
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
  }, [focusPoiId, filtered, activeCount, loading])

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

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)_+_1rem)] pb-12">
        {/* 搜索（右侧内嵌筛选）+ 问地图 */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-full border-2 border-on-surface bg-white pl-4 pr-1.5 py-1.5 shadow-sticker-sm">
            <Icon name="search" className="text-on-surface-variant text-xl shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜店名…"
              className="flex-1 min-w-0 bg-transparent outline-none font-body text-on-surface placeholder:text-on-surface-variant/60"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="清空搜索" className="shrink-0 text-on-surface-variant press-sm">
                <Icon name="close" className="text-lg" />
              </button>
            )}
            <span className="w-px h-5 bg-on-surface/15 shrink-0" />
            {/* 筛选：内嵌搜索框右侧，点开多维筛选弹窗 */}
            <button
              onClick={() => setFilterOpen(true)}
              aria-label="筛选"
              className={`relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center press-sm ${
                activeCount ? 'bg-primary text-white' : 'text-on-surface-variant'
              }`}
            >
              <Icon name="tune" className="text-xl" />
              {activeCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full bg-accent border-2 border-on-surface text-on-surface text-[9px] font-bold flex items-center justify-center">
                  {activeCount}
                </span>
              )}
            </button>
          </div>
          <button
            onClick={() => setAskOpen(true)}
            className="shrink-0 bg-primary text-white rounded-full border-2 border-on-surface shadow-sticker px-4 flex items-center gap-1 press font-headline font-bold"
          >
            <Icon name="forum" className="text-lg" />
            问地图
          </button>
        </div>

        {/* 已选筛选条件：点 ✕ 可单独移除 */}
        {activeCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {filters.status.map((s) => (
              <ActiveChip key={s} label={STATUS_OPTS.find((o) => o.key === s)?.label || s} onRemove={() => toggleStatus(s)} />
            ))}
            {filters.moods.map((m) => (
              <ActiveChip key={m} label={`${m} ${MOOD_LABEL[m]}`} onRemove={() => toggleMood(m)} />
            ))}
            {filters.cuisines.map((c) => (
              <ActiveChip key={c} label={c} variant="white" onRemove={() => toggleCuisine(c)} />
            ))}
            <button onClick={clearFilters} className="text-xs font-bold text-on-surface-variant px-2 py-1 underline">
              清空
            </button>
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
            {query.trim() ? `没搜到「${query.trim()}」` : '没有符合筛选的店 🍃'}
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
      {filterOpen && (
        <FilterSheet
          filters={filters}
          moodCount={moodCount}
          statusCount={statusCount}
          cuisineList={cuisineList}
          resultCount={filtered.length}
          onToggleMood={toggleMood}
          onToggleStatus={toggleStatus}
          onToggleCuisine={toggleCuisine}
          onClear={clearFilters}
          onClose={() => setFilterOpen(false)}
        />
      )}
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
  const headPhoto = (point.amap_photos || '').split('|').filter(Boolean)[0]
  const isManual = String(point.poi_id).startsWith('m_')
  const hasCoords = !!(point.lng && point.lat)

  return (
    <div
      ref={cardRef}
      className={`sticker p-3 transition-shadow ${STATUS_CARD[status.key]} ${flashing ? 'ring-4 ring-accent' : ''}`}
    >
      {/* 头部 */}
      <div className="flex items-start gap-3">
        {headPhoto ? (
          <img
            src={headPhoto}
            alt=""
            loading="lazy"
            className="w-11 h-11 rounded-full border-2 border-on-surface object-cover shrink-0 bg-white"
          />
        ) : (
          <span className="w-11 h-11 rounded-full border-2 border-on-surface bg-white flex items-center justify-center text-xl shrink-0">
            {headEmoji}
          </span>
        )}
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

      {/* 时间线（吃过行 + 种草虚线框） */}
      <div className="mt-3 flex flex-col gap-3">
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
      <div className="border-2 border-dashed border-on-surface/25 rounded-xl px-3 py-2 bg-surface/40">
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 text-sm">
            <span className="font-bold text-on-surface-variant">{w.source}种草</span>
            {w.reason && <> · {w.reason}</>}
            <span className="text-[11px] font-bold text-on-surface-variant/60"> · {prettyDate(w.created_at)}</span>
            {w.status === 'visited' && <span className="ml-1 text-[10px] font-bold bg-green-accent/15 text-green-accent rounded px-1">已兑现</span>}
            {authorTag}
          </p>
          <button onClick={onEdit} className="shrink-0 text-on-surface-variant opacity-60">
            <Icon name="edit" className="text-base" />
          </button>
        </div>
      </div>
    )
  }

  const v = event.data
  const photos = (v.my_photos || '').split('|').filter(Boolean)
  const flavors = (v.flavors || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
  const dishes = (v.dishes || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
  const metaText = [v.companions, `¥${v.per_person}/人`, v.value_label].filter(Boolean).join(' · ')
  const chip = 'text-[11px] font-bold text-on-surface-variant bg-surface border border-on-surface/15 rounded-full px-2 py-0.5'
  return (
    <div className="flex gap-2 items-start">
      <span className="text-lg shrink-0">{v.mood_emoji}</span>
      <div className="flex-1 min-w-0">
        {/* 时间 + 浅色药丸（药丸挪到时间后） + 标记 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-on-surface-variant">
            {prettyDate(v.date)} {v.meal_period}
          </span>
          <span className="text-sm leading-none" title={v.want_again ? '还想再来' : '没想再来'}>
            {v.want_again ? '❤️' : '🤍'}
          </span>
          {metaText && (
            <span className="text-[11px] font-bold text-on-surface-variant bg-surface border border-on-surface/15 rounded-full px-2 py-0.5">
              {metaText}
            </span>
          )}
          {v.wish_id && <span className="text-[10px] font-bold bg-primary/15 text-primary rounded px-1">兑现 ✨</span>}
          {authorTag}
        </div>
        {/* 点评 + 口味/菜品/菜系/场合 标签 */}
        {(v.feeling || flavors.length > 0 || dishes.length > 0 || v.cuisine || v.occasion) && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {v.feeling && <span className={chip}>💬 {v.feeling}</span>}
            {flavors.map((f) => (
              <span key={'f' + f} className={chip}>🌶️ {f}</span>
            ))}
            {dishes.map((d) => (
              <span key={'d' + d} className={chip}>🍽️ {d}</span>
            ))}
            {v.cuisine && <span className={chip}>{v.cuisine}</span>}
            {v.occasion && <span className={chip}>{v.occasion}</span>}
          </div>
        )}
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

function FilterSheet({
  filters,
  moodCount,
  statusCount,
  cuisineList,
  resultCount,
  onToggleMood,
  onToggleStatus,
  onToggleCuisine,
  onClear,
  onClose,
}: {
  filters: Filters
  moodCount: Record<string, number>
  statusCount: Record<string, number>
  cuisineList: { name: string; n: number }[]
  resultCount: number
  onToggleMood: (m: Mood) => void
  onToggleStatus: (s: StatusKey) => void
  onToggleCuisine: (c: string) => void
  onClear: () => void
  onClose: () => void
}) {
  const activeCount = filters.moods.length + filters.status.length + filters.cuisines.length
  return (
    <SheetShell onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline text-xl">筛选</h3>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-sm font-bold text-on-surface-variant flex items-center gap-1 press-sm">
            <Icon name="restart_alt" className="text-base" /> 清空
          </button>
        )}
      </div>

      {MOODS.some((m) => moodCount[m] > 0) && (
        <FilterGroup title="评分">
          {MOODS.filter((m) => moodCount[m] > 0).map((m) => (
            <FilterChip key={m} active={filters.moods.includes(m)} onClick={() => onToggleMood(m)} label={m} count={moodCount[m]} big />
          ))}
        </FilterGroup>
      )}

      {STATUS_OPTS.some((s) => statusCount[s.key] > 0) && (
        <FilterGroup title="状态">
          {STATUS_OPTS.filter((s) => statusCount[s.key] > 0).map((s) => (
            <FilterChip
              key={s.key}
              active={filters.status.includes(s.key)}
              onClick={() => onToggleStatus(s.key)}
              icon={s.icon}
              label={s.label}
              count={statusCount[s.key]}
            />
          ))}
        </FilterGroup>
      )}

      {cuisineList.length > 0 && (
        <FilterGroup title="菜系">
          {cuisineList.map((c) => (
            <FilterChip key={c.name} active={filters.cuisines.includes(c.name)} onClick={() => onToggleCuisine(c.name)} label={c.name} count={c.n} />
          ))}
        </FilterGroup>
      )}

      <StickerButton full className="mt-2" onClick={onClose}>
        查看 {resultCount} 家结果
      </StickerButton>
    </SheetShell>
  )
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-sm font-bold text-on-surface-variant mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  icon,
  label,
  count,
  big,
}: {
  active: boolean
  onClick: () => void
  icon?: string
  label: string
  count: number
  big?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border-2 border-on-surface px-3 py-1.5 font-bold shadow-sticker-sm press-sm ${
        big ? 'text-lg' : 'text-sm'
      } ${active ? 'bg-primary text-white' : 'bg-white text-on-surface-variant'}`}
    >
      {icon && <Icon name={icon} className="text-base" />}
      {label} <em className="not-italic opacity-70 text-xs">{count}</em>
    </button>
  )
}

function ActiveChip({ label, onRemove, variant = 'filled' }: { label: string; onRemove: () => void; variant?: 'filled' | 'white' }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border-2 border-on-surface text-xs font-bold pl-2.5 pr-1 py-1 shadow-sticker-sm ${
        variant === 'white' ? 'bg-white text-on-surface' : 'bg-primary text-white'
      }`}
    >
      {label}
      <button onClick={onRemove} aria-label="移除" className="press-sm">
        <Icon name="close" className="text-sm" />
      </button>
    </span>
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
