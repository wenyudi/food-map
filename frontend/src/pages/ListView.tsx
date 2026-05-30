import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { getPoints, getMonthlyStory, askMap } from '../api'
import type { Point, Wish, Visit } from '../api'
import { cleanTag } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import EditRecordSheet from '../components/EditRecordSheet'

type EditTarget = { kind: 'visit' | 'wish'; data: any; storeName: string }

type FilterKey = 'all' | 'fav' | 'want' | 'fulfilled' | 'repeat'

interface StoreStatus {
  key: 'want' | 'fulfilled' | 'repeat' | 'direct'
  icon: string
  label: string
}

function getStatus(p: Point): StoreStatus {
  const visitCount = p.visit_count
  const everWished = p.wish != null
  if (visitCount === 0) return { key: 'want', icon: '🤍', label: '种草中' }
  if (visitCount >= 2) return { key: 'repeat', icon: '🔁', label: '二刷' }
  if (everWished) return { key: 'fulfilled', icon: '✨', label: '已兑现' }
  return { key: 'direct', icon: '📍', label: '直奔' }
}

type TimelineEvent =
  | { type: 'wish'; date: string; data: Wish }
  | { type: 'visit'; date: string; data: Visit }

function buildTimeline(p: Point): TimelineEvent[] {
  const events: TimelineEvent[] = []
  if (p.wish) {
    events.push({ type: 'wish', date: (p.wish.created_at || '').slice(0, 10), data: p.wish })
  }
  p.visits.forEach(v => events.push({ type: 'visit', date: v.date, data: v }))
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

function latestTs(p: Point): number {
  const visits = p.visits.map(v => Date.parse(v.date) || 0)
  const wishTs = p.wish ? Date.parse(p.wish.created_at) || 0 : 0
  return Math.max(0, wishTs, ...visits)
}

interface Props {
  refreshKey: number
  focusPoiId?: string | null
  onPickStore?: (poiId: string) => void
  onJumpToAdd?: () => void
  myUsername?: string
}

// 把一家店 + 最新一笔整理成可分享的文字
function buildShareText(p: Point): string {
  const lines: string[] = [`📍「${p.name}」`]
  const meta = [p.business_area, cleanTag(p.tag), p.cost && `人均¥${p.cost}`].filter(Boolean).join(' · ')
  if (meta) lines.push(meta)
  const lastVisit = [...p.visits].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
  if (lastVisit) {
    const bits = [lastVisit.mood_emoji, lastVisit.feeling].filter(Boolean).join(' ')
    lines.push(bits || '我记过一笔')
  } else if (p.wish?.reason) {
    lines.push(`想去：${p.wish.reason}`)
  }
  lines.push('—— 来自我的美食地图')
  return lines.join('\n')
}

export default function ListView({ refreshKey, focusPoiId, onPickStore, onJumpToAdd, myUsername }: Props) {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [flashId, setFlashId] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [askOpen, setAskOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [seenTs, setSeenTs] = useState(() => localStorage.getItem('partner_seen_ts') || '')

  // 圈子里是否有多个记录者 → 决定要不要显示"谁写的"
  const multiAuthor = useMemo(() => {
    const set = new Set<string>()
    points.forEach(p => {
      p.visits.forEach(v => v.recorded_by && set.add(v.recorded_by))
      if (p.wish?.recorded_by) set.add(p.wish.recorded_by)
    })
    return set.size > 1
  }, [points])

  // 同伴动态：同伴（非我）在我上次"已读"之后新记了几笔
  const partnerNews = useMemo(() => {
    if (!myUsername) return null
    let count = 0, who = '', latest = ''
    const consider = (by?: string, ts?: string) => {
      if (!by || by === myUsername || !ts) return
      if (ts > latest) latest = ts
      if (ts > seenTs) { count++; who = by }
    }
    points.forEach(p => {
      p.visits.forEach(v => consider(v.recorded_by, v.created_at))
      consider(p.wish?.recorded_by, p.wish?.created_at)
    })
    return (count > 0 && seenTs) ? { count, who, latest } : null
  }, [points, myUsername, seenTs])

  // 首次：把现有记录都标为"已读"，避免一上来就显示一堆"新的"
  useEffect(() => {
    if (localStorage.getItem('partner_seen_ts') !== null || !points.length) return
    let maxTs = ''
    points.forEach(p => {
      p.visits.forEach(v => { if (v.created_at && v.created_at > maxTs) maxTs = v.created_at })
      if (p.wish?.created_at && p.wish.created_at > maxTs) maxTs = p.wish.created_at
    })
    localStorage.setItem('partner_seen_ts', maxTs)
    setSeenTs(maxTs)
  }, [points])

  function markPartnerSeen(ts: string) {
    setSeenTs(ts)
    localStorage.setItem('partner_seen_ts', ts)
  }

  async function shareStore(p: Point) {
    const text = buildShareText(p)
    try {
      if (navigator.share) await navigator.share({ title: p.name, text })
      else {
        await navigator.clipboard.writeText(text)
        setToast('已复制，粘贴给朋友吧 📋')
        setTimeout(() => setToast(null), 1800)
      }
    } catch { /* 用户取消，忽略 */ }
  }
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const load = useCallback(() => {
    setLoading(true)
    getPoints().then(setPoints).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load, refreshKey])

  const { filtered, counts } = useMemo(() => {
    const c = { all: points.length, fav: 0, want: 0, fulfilled: 0, repeat: 0 }
    const enriched = points.map(p => {
      const status = getStatus(p)
      if (status.key === 'want') c.want++
      else if (status.key === 'fulfilled') c.fulfilled++
      else if (status.key === 'repeat') c.repeat++
      if (p.visits.some(v => v.want_again)) c.fav++   // 想再来：任一笔标了想再来
      return { p, status }
    })
    let result = enriched
    if (filter === 'fav') result = result.filter(e => e.p.visits.some(v => v.want_again))
    else if (filter !== 'all') result = result.filter(e => e.status.key === filter)
    const q = query.trim().toLowerCase()
    if (q) result = result.filter(e => e.p.name.toLowerCase().includes(q))
    result.sort((a, b) => latestTs(b.p) - latestTs(a.p))
    return { filtered: result, counts: c }
  }, [points, filter, query])

  // 收到 focusPoiId 时滚动到那张卡片 + 临时高亮
  useEffect(() => {
    if (!focusPoiId || loading) return
    const inFiltered = filtered.find(e => e.p.poi_id === focusPoiId)
    if (!inFiltered && filter !== 'all') {
      setFilter('all')  // 切到全部后下次 useEffect 再滚
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

  return (
    <div className="page list">
      {partnerNews && (
        <button className="partner-news" onClick={() => markPartnerSeen(partnerNews.latest)}>
          <span className="pn-dot" />
          👋 {partnerNews.who} 最近记了 {partnerNews.count} 笔，看看 TA 吃了啥
        </button>
      )}

      <MonthlySummary points={points} refreshKey={refreshKey} />

      {points.length > 0 && (
        <button className="ask-bar" onClick={() => setAskOpen(true)}>
          🔮 问问这张地图…
        </button>
      )}

      {points.length > 0 && (
        <div className="list-search">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="🔍 搜店名…" />
          {query && <button className="ls-clear" onClick={() => setQuery('')} aria-label="清除">✕</button>}
        </div>
      )}

      {points.length > 0 && (
        <div className="filter-chips">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            全部 <em>{counts.all}</em>
          </Chip>
          <Chip active={filter === 'fav'} onClick={() => setFilter('fav')}>
            ⭐ 想再来 <em>{counts.fav}</em>
          </Chip>
          <Chip active={filter === 'want'} onClick={() => setFilter('want')}>
            🤍 想去 <em>{counts.want}</em>
          </Chip>
          <Chip active={filter === 'fulfilled'} onClick={() => setFilter('fulfilled')}>
            ✨ 已兑现 <em>{counts.fulfilled}</em>
          </Chip>
          <Chip active={filter === 'repeat'} onClick={() => setFilter('repeat')}>
            🔁 二刷 <em>{counts.repeat}</em>
          </Chip>
        </div>
      )}

      {loading && <ListSkeleton />}

      {!loading && points.length === 0 && (
        <div className="list-empty">
          <div className="list-empty-emoji">🍜</div>
          <div className="list-empty-title">还没有记录</div>
          <div className="list-empty-sub">记下第一家店，这里就会热闹起来</div>
          {onJumpToAdd && (
            <button className="map-empty-btn" onClick={onJumpToAdd}>✏️ 去记第一笔</button>
          )}
        </div>
      )}

      {!loading && points.length > 0 && filtered.length === 0 && (
        <div className="empty">{query.trim() ? `没搜到「${query.trim()}」` : '这个分类下还没有 🍃'}</div>
      )}

      <div className="store-list">
        {!loading && filtered.map(({ p, status }, i) => (
          <StoreCard
            key={p.poi_id}
            index={i}
            point={p}
            status={status}
            flashing={flashId === p.poi_id}
            cardRef={(el) => { cardRefs.current[p.poi_id] = el }}
            onClick={() => onPickStore?.(p.poi_id)}
            onEdit={setEditing}
            onShare={() => shareStore(p)}
            showAuthor={multiAuthor}
            myUsername={myUsername}
          />
        ))}
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
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

function AskSheet({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const EXAMPLES = ['还有几家种草没去？', '最贵的一顿是哪家？', '想吃清淡的，之前去过哪些？', '哪家店去得最多？']

  async function ask(question?: string) {
    const qq = (question ?? q).trim()
    if (!qq) return
    setQ(qq); setLoading(true); setErr(null); setAnswer('')
    try {
      const r = await askMap(qq)
      setAnswer(r.answer)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '没答上来，再试一次')
    } finally { setLoading(false) }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">🔮 问问这张地图</div>
        <div className="suggest-craving">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="比如：还有几家种草没去？"
            onKeyDown={e => { if (e.key === 'Enter') ask() }}
            autoFocus
          />
          <button onClick={() => ask()} disabled={loading || !q.trim()}>{loading ? '…' : '问'}</button>
        </div>

        {!answer && !loading && !err && (
          <div className="ask-examples">
            {EXAMPLES.map(e => (
              <button key={e} className="ask-ex" onClick={() => ask(e)}>{e}</button>
            ))}
          </div>
        )}

        {loading && <div className="as-skeleton"><span></span><span></span><span></span></div>}
        {err && <div className="add-error">{err}</div>}
        {answer && <div className="ask-answer">{answer}</div>}
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="store-list">
      {[0, 1, 2].map(i => (
        <div className="skel-card" key={i}>
          <div className="skel-row">
            <div className="skel-circle" />
            <div className="skel-lines">
              <span className="skel-line w70" />
              <span className="skel-line w40" />
            </div>
          </div>
          <div className="skel-lines">
            <span className="skel-line w90" />
            <span className="skel-line w60" />
          </div>
        </div>
      ))}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button className={'chip' + (active ? ' active' : '')} onClick={onClick}>
      {children}
    </button>
  )
}

function StoreCard({ point, status, flashing, cardRef, onClick, onEdit, onShare, showAuthor, myUsername, index }: {
  point: Point
  status: StoreStatus
  flashing: boolean
  cardRef: (el: HTMLDivElement | null) => void
  onClick?: () => void
  onEdit: (t: EditTarget) => void
  onShare: () => void
  showAuthor: boolean
  myUsername?: string
  index: number
}) {
  const timeline = buildTimeline(point)
  const headEmoji = point.visit_count > 0 ? point.emoji : '🤍'
  const isManual = String(point.poi_id).startsWith('m_')
  const hasCoords = !!(point.lng && point.lat)

  return (
    <div
      ref={cardRef}
      className={`store-card status-${status.key}` + (flashing ? ' flashing' : '')}
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
      onClick={hasCoords ? onClick : undefined}
      role="button"
    >
      <div className="store-card-head">
        <div className="store-head-emoji">{headEmoji}</div>
        <div className="store-head-text">
          <div className="store-name">{point.name}{isManual && <span className="manual-flag">手动</span>}</div>
          <div className="store-meta">
            {[
              point.business_area,
              cleanTag(point.tag),
              point.rating && `⭐ ${point.rating}`,
              point.cost && `¥${point.cost}/人`,
            ].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className={`status-badge badge-${status.key}`}>
          <span>{status.icon}</span>
          <em>{status.label}</em>
        </div>
      </div>

      <div className="timeline">
        {timeline.map((e, i) => (
          <TimelineRow
            key={i}
            event={e}
            isLast={i === timeline.length - 1}
            onEdit={() => onEdit({ kind: e.type, data: e.data, storeName: point.name })}
            showAuthor={showAuthor}
            myUsername={myUsername}
          />
        ))}
      </div>

      <div className="store-card-foot">
        <span className="scf-hint">{hasCoords ? '看在地图上 →' : '📍 未定位'}</span>
        <button className="card-share" onClick={(e) => { e.stopPropagation(); onShare() }}>↗ 分享</button>
      </div>
    </div>
  )
}

function TimelineRow({ event, isLast, onEdit, showAuthor, myUsername }: {
  event: TimelineEvent; isLast: boolean; onEdit: () => void
  showAuthor: boolean; myUsername?: string
}) {
  const editBtn = (
    <button className="tl-edit" onClick={e => { e.stopPropagation(); onEdit() }} aria-label="编辑">✏️</button>
  )
  const by = event.data.recorded_by
  const authorTag = showAuthor && by
    ? <span className="tl-by">{by === myUsername ? '你记的' : `${by} 记的`}</span>
    : null
  if (event.type === 'wish') {
    const w = event.data
    return (
      <div className="tl-row">
        <div className="tl-axis">
          <div className="tl-dot wish">🤍</div>
          {!isLast && <div className="tl-line" />}
        </div>
        <div className="tl-body">
          <div className="tl-date">
            {prettyDate(w.created_at)} · {w.source}种草
            {w.status === 'visited' && <span className="tl-pill">已兑现</span>}
            {authorTag}
          </div>
          {w.reason && <div className="tl-content">{w.reason}</div>}
        </div>
        {editBtn}
      </div>
    )
  }
  const v = event.data
  const photos = (v.my_photos || '').split('|').filter(Boolean)
  return (
    <div className="tl-row">
      <div className="tl-axis">
        <div className="tl-dot visit">{v.mood_emoji}</div>
        {!isLast && <div className="tl-line" />}
      </div>
      <div className="tl-body">
        <div className="tl-date">
          {prettyDate(v.date)} {v.meal_period}
          {v.wish_id && <span className="tl-pill warm">兑现 ✨</span>}
          {!!v.want_again && <span className="tl-star">⭐</span>}
          {authorTag}
        </div>
        <div className="tl-info">
          {v.companions} · ¥{v.per_person}/人
          {v.value_label && ` · ${v.value_label}`}
        </div>
        {v.feeling && <div className="tl-content">{v.feeling}</div>}
        {photos.length > 0 && (
          <div className="tl-photos">
            {photos.map(u => <img src={u} key={u} className="zoomable" />)}
          </div>
        )}
      </div>
      {editBtn}
    </div>
  )
}

function MonthlySummary({ points, refreshKey }: { points: Point[]; refreshKey: number }) {
  const data = useMemo(() => {
    const now = new Date()
    const thisMonth = now.toISOString().slice(0, 7)
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = lastMonthDate.toISOString().slice(0, 7)

    const thisVisits: Array<Visit & { tag?: string }> = []
    const lastVisits: Visit[] = []

    for (const p of points) {
      for (const v of p.visits) {
        if (v.date.startsWith(thisMonth)) thisVisits.push({ ...v, tag: p.tag })
        else if (v.date.startsWith(lastMonth)) lastVisits.push(v)
      }
    }

    const totalSpent = thisVisits.reduce((s, v) => s + Number(v.amount || 0), 0)
    const wishCount = points.filter(p => p.wish && p.wish.status === 'want').length
    const fulfilledThisMonth = thisVisits.filter(v => v.wish_id).length

    const tagCount: Record<string, number> = {}
    thisVisits.forEach(v => {
      const t = cleanTag(v.tag, 1)  // 只取主类目，且清掉高德的 | 分隔
      if (t) tagCount[t] = (tagCount[t] || 0) + 1
    })
    const topTag = Object.entries(tagCount).sort((a, b) => b[1] - a[1])[0]

    return {
      thisMonth: thisMonth.replace('-', '/'),
      yearMonth: thisMonth,
      visitCount: thisVisits.length,
      lastCount: lastVisits.length,
      totalSpent,
      topTag: topTag?.[0],
      wishCount,
      fulfilledThisMonth,
    }
  }, [points])

  // 数字滚动到位（仪表盘点亮感）
  const cVisit = Math.round(useCountUp(data.visitCount))
  const cSpent = Math.round(useCountUp(data.totalSpent))
  const cFulfilled = Math.round(useCountUp(data.fulfilledThisMonth))

  // AI 故事
  const [story, setStory] = useState<string>('')
  const [storyLoading, setStoryLoading] = useState(false)
  const [storyError, setStoryError] = useState<string | null>(null)

  // 折叠状态：默认展开，用户点折叠后记 localStorage，下次进入恢复；新数据来了自动展开
  const lsKey = `ms_collapsed_${data.yearMonth}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(lsKey) === '1'
  })

  // refreshKey 变化（>0 表示用户提交了新数据） → 自动展开
  useEffect(() => {
    if (refreshKey === 0) return
    try { localStorage.removeItem(lsKey) } catch {}
    setCollapsed(false)
  }, [refreshKey, lsKey])

  function toggle() {
    setCollapsed(prev => {
      const next = !prev
      try {
        if (next) localStorage.setItem(lsKey, '1')
        else localStorage.removeItem(lsKey)
      } catch {}
      return next
    })
  }

  async function loadStory(regenerate = false) {
    if (data.visitCount === 0) return
    setStoryLoading(true)
    setStoryError(null)
    try {
      const r = await getMonthlyStory(data.yearMonth, regenerate)
      setStory(r.story || '')
    } catch (e: any) {
      setStoryError(e?.message || '生成失败')
    } finally {
      setStoryLoading(false)
    }
  }

  // 展开时才加载故事（避免折叠态浪费 token / 网络请求）
  useEffect(() => {
    if (!collapsed && data.visitCount > 0 && !story) loadStory(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, data.yearMonth, data.visitCount, refreshKey])

  if (data.visitCount === 0 && data.wishCount === 0) return null

  const delta = data.visitCount - data.lastCount
  const deltaTxt = data.lastCount === 0
    ? ''
    : delta > 0 ? `↑ 上月 ${data.lastCount}` : delta < 0 ? `↓ 上月 ${data.lastCount}` : `= 上月`

  // 折叠态：一行紧凑摘要
  if (collapsed) {
    return (
      <button className="monthly-summary collapsed" onClick={toggle}>
        <span className="ms-collapsed-title">📊 本月</span>
        <span className="ms-collapsed-stats">
          <b>{cVisit}</b> 次 · <b>¥{cSpent}</b>
          {data.topTag && <> · 最爱 <b>{data.topTag}</b></>}
          {data.fulfilledThisMonth > 0 && <> · 兑现 <b>{cFulfilled}</b> ✨</>}
        </span>
        <span className="ms-toggle-icon">▼</span>
      </button>
    )
  }

  // 展开态：完整卡片
  return (
    <div className="monthly-summary">
      <div className="ms-head">
        <span className="ms-title">📊 本月小结</span>
        <span className="ms-month">
          {data.thisMonth}
          <button className="ms-collapse-btn" onClick={toggle} title="收起">▲</button>
        </span>
      </div>
      <div className="ms-stats">
        <div className="ms-stat">
          <div className="ms-value">{cVisit}</div>
          <div className="ms-label">次出门</div>
          {deltaTxt && <div className="ms-delta">{deltaTxt}</div>}
        </div>
        <div className="ms-stat">
          <div className="ms-value">¥{cSpent}</div>
          <div className="ms-label">总花费</div>
        </div>
        {data.topTag && (
          <div className="ms-stat">
            <div className="ms-value">{data.topTag}</div>
            <div className="ms-label">最常吃</div>
          </div>
        )}
        {data.fulfilledThisMonth > 0 && (
          <div className="ms-stat">
            <div className="ms-value">{cFulfilled}</div>
            <div className="ms-label">兑现种草 ✨</div>
          </div>
        )}
      </div>

      {data.visitCount > 0 && (
        <div className="ai-story">
          <div className="as-head">
            <span className="as-title">✍️ AI 写的本月回忆</span>
            <button
              className="as-refresh"
              onClick={() => loadStory(true)}
              disabled={storyLoading}
              title="换一段"
            >
              {storyLoading ? '…' : '🔄'}
            </button>
          </div>
          {storyLoading && !story && (
            <div className="as-skeleton">
              <span></span><span></span><span></span>
            </div>
          )}
          {storyError && <div className="as-error">{storyError}</div>}
          {story && <div className={'as-body' + (storyLoading ? ' fading' : '')}>{story}</div>}
        </div>
      )}
    </div>
  )
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
