import { useMemo, useState } from 'react'
import Icon from '../ui/Icon'
import SheetShell from '../ui/SheetShell'
import Button from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import Presence from '../ui/Presence'
import ScopeBar from '../ui/ScopeBar'
import Stamp from '../ui/Stamp'
import Toast from '../ui/Toast'
import AskSheet from './AskSheet'
import FilterSheet from '../components/FilterSheet'
import StoreDetail from '../components/StoreDetail'
import { buildTimeline, getStatus, prettyDate, STATUS_STAMP, storeCuisine } from '../components/StoreTimeline'
import type { Point } from '../api'
import { latestTs, recordLabel } from '../lib/browse'
import type { Scope } from '../lib/browse'
import { fmtDist } from '../lib/format'
import { MOOD_LABEL } from '../lib/moods'
import type { Mood } from '../lib/moods'
import { cuisineEmoji } from '../lib/taste'
import type { Browse } from '../lib/useBrowse'

type ListScreenProps = Readonly<{
  browse: Browse
  /** 圈友新记了的店 */
  newPoiIds: Set<string>
  onShowOnMap: (poiId: string) => void
  onRecordStore: (poiId: string) => void
  onCompose: () => void
  onInvite: () => void
  myUsername?: string
  circleRole?: string
}>

/** 按月分组的标题：本月 / 10 月 / 2025 年 8 月 */
function monthLabel(ts: number): string {
  if (!ts) return '更早'
  const d = new Date(ts)
  const now = new Date()
  if (d.getFullYear() !== now.getFullYear()) return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
  return d.getMonth() === now.getMonth() ? '本月' : `${d.getMonth() + 1} 月`
}

/** 清单：一家店一行，够认出来、够回想起来就好；要细看点开详情 */
export default function ListScreen({ browse, newPoiIds, onShowOnMap, onRecordStore, onCompose, onInvite, myUsername, circleRole }: ListScreenProps) {
  const { points, loading, loadError, reload, scope, setScope, filters, toggleFilter, clearFilters, query, setQuery, counts, visible, sort, setSort, sortNear, distanceOf, facets, multiAuthor, activeCount } = browse
  const [filterOpen, setFilterOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const [locating, setLocating] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const canWrite = circleRole !== 'viewer'

  // 按 id 从全量取：改完 / 删完记录立刻是新数据；店没了详情自己关
  const opened = openId ? points.find((p) => p.poi_id === openId) || null : null

  const summary = useMemo(() => {
    const meals = points.reduce((n, p) => n + p.visit_count, 0)
    const spent = points.reduce((n, p) => n + p.visits.reduce((m, v) => m + (Number(v.amount) || 0), 0), 0)
    return meals ? `一起吃了 ${meals} 顿 · 花了 ¥${Math.round(spent)}` : '吃过的、想去的，都收在这里'
  }, [points])

  async function toggleSort() {
    if (sort === 'near') return setSort('recent')
    setLocating(true)
    const ok = await sortNear()
    setLocating(false)
    if (!ok) {
      setToast('定位没成功，检查下定位权限')
      setTimeout(() => setToast(null), 2200)
    }
  }

  const removable = [
    ...filters.status.map((s) => ({ key: 's' + s, label: facetsStatusLabel(s), onRemove: () => toggleFilter('status', s) })),
    ...filters.moods.map((m) => ({ key: 'm' + m, label: `${m} ${MOOD_LABEL[m as Mood]}`, onRemove: () => toggleFilter('moods', m) })),
    ...filters.cuisines.map((c) => ({ key: 'c' + c, label: c, onRemove: () => toggleFilter('cuisines', c) })),
    ...filters.authors.map((a) => ({
      key: 'a' + a,
      label: `${facets.authorList.find((x) => x.u === a)?.nick || a} 记的`,
      onRemove: () => toggleFilter('authors', a),
    })),
  ]

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-tabbar" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 56)}>
        {/* 大标题 */}
        <header className="pt-[calc(env(safe-area-inset-top)_+_1.25rem)] pb-1 animate-fade-up">
          <h1 className="text-[28px] font-bold tracking-tight leading-tight">清单</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">{loading && points.length === 0 ? '翻一翻…' : summary}</p>
        </header>

        {/* 吸顶：搜索 + 筛选 + 问地图，范围切换 + 排序 */}
        <div
          className={`sticky top-0 z-20 -mx-4 px-4 pt-[calc(env(safe-area-inset-top)_+_0.5rem)] pb-2.5 -mt-[env(safe-area-inset-top)] transition-[background-color,box-shadow] duration-300 ${
            scrolled ? 'bg-surface/85 backdrop-blur-xl shadow-[0_1px_0_#ece3d8]' : ''
          }`}
        >
          <div className="flex gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 rounded-full bg-white shadow-soft ring-1 ring-line pl-4 pr-1.5 py-1.5 transition-shadow has-[input:focus]:ring-primary/40 has-[input:focus]:shadow-ring">
              <Icon name="search" className="text-on-surface-variant text-xl shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜店名…"
                enterKeyHint="search"
                className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-on-surface placeholder:text-on-surface-variant/60"
              />
              {query && (
                <button onClick={() => setQuery('')} aria-label="清空搜索" className="shrink-0 w-6 h-6 rounded-full bg-surface-2 text-on-surface-variant flex items-center justify-center press-sm animate-pop-in">
                  <Icon name="close" className="text-[15px]" />
                </button>
              )}
              <button
                onClick={() => setFilterOpen(true)}
                aria-label="筛选"
                className={`relative shrink-0 w-9 h-9 rounded-full flex items-center justify-center press-sm transition-colors ${removable.length ? 'bg-primary text-white' : 'bg-surface-2 text-on-surface-variant'}`}
              >
                <Icon name="tune" className="text-xl" />
                {removable.length > 0 && (
                  <span key={removable.length} className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent ring-2 ring-white text-on-surface text-[10px] font-bold flex items-center justify-center animate-pop-in">
                    {removable.length}
                  </span>
                )}
              </button>
            </div>
            <button onClick={() => setAskOpen(true)} className="shrink-0 bg-primary-soft text-primary-dark rounded-full px-4 flex items-center gap-1 press font-semibold text-[15px]">
              <Icon name="forum" filled className="text-lg" />
              问地图
            </button>
          </div>

          <div className="flex items-center gap-2 mt-2.5">
            <ScopeBar
              inline
              className="flex-1 bg-surface-2"
              active={scope}
              onPick={(k) => setScope(k as Scope)}
              cells={[
                { key: 'all', label: '全部', value: counts.all },
                { key: 'visited', label: '吃过', value: counts.visited },
                { key: 'want', label: '想去', value: counts.want },
              ]}
            />
            <button
              onClick={toggleSort}
              aria-pressed={sort === 'near'}
              className={`shrink-0 h-[38px] rounded-full px-3 flex items-center gap-1 text-[13px] font-semibold press-sm transition-colors ${sort === 'near' ? 'bg-primary-soft text-primary-dark' : 'bg-surface-2 text-on-surface-variant'}`}
            >
              <Icon name={sort === 'near' ? 'near_me' : 'schedule'} filled={sort === 'near'} className={`text-[16px] ${locating ? 'animate-pulse' : ''}`} />
              {sort === 'near' ? '离我近' : '最近'}
            </button>
          </div>

          {/* 已选筛选条件：点 ✕ 可单独移除 */}
          {removable.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
              {removable.map((r) => (
                <ActiveChip key={r.key} label={r.label} onRemove={r.onRemove} />
              ))}
              <button onClick={clearFilters} className="text-xs font-medium text-on-surface-variant px-2 py-1 press-sm">
                清空
              </button>
            </div>
          )}
        </div>

        {loading && points.length === 0 && <ListSkeleton />}

        {/* 加载失败 ≠ 没有记录：明确告知 + 一键重试，别让人误以为记录丢了 */}
        {!loading && loadError && (
          <EmptyState
            emoji="📡"
            title="没连上网"
            desc="记录都好好的，连上网刷新就回来"
            action={
              <Button onClick={reload}>
                <Icon name="refresh" /> 再试一次
              </Button>
            }
          />
        )}

        {!loading && !loadError && points.length === 0 && (
          <EmptyState
            emoji="🍜"
            title={canWrite ? '还没有记录' : '这个圈还空着'}
            desc={canWrite ? '记下第一家店，这里就会热闹起来' : '等记录员添上第一家，这里就热闹了'}
            action={
              canWrite && (
                <Button onClick={onCompose}>
                  <Icon name="edit" filled /> 去记第一笔
                </Button>
              )
            }
            extra={
              canWrite && (
                <button onClick={onInvite} className="text-sm font-medium text-on-surface-variant underline underline-offset-4 press-sm">
                  或拉饭搭子进圈一起记
                </button>
              )
            }
          />
        )}

        {!loading && points.length > 0 && visible.length === 0 && (
          <EmptyState
            emoji="🍃"
            title={query.trim() ? `没搜到「${query.trim()}」` : '这里还没有店'}
            desc={activeCount > 0 ? '换个词，或者清掉几个筛选条件试试' : scope === 'want' ? '刷到想吃的店，记一笔「想去」就会收在这里' : '换个范围看看'}
            action={
              activeCount > 0 && (
                <Button variant="white" onClick={clearFilters}>
                  清掉筛选
                </Button>
              )
            }
          />
        )}

        <div className="flex flex-col gap-2.5 mt-1">
          {visible.map((p, i) => {
            const month = sort === 'recent' ? monthLabel(latestTs(p)) : ''
            const showMonth = !!month && (i === 0 || month !== monthLabel(latestTs(visible[i - 1])))
            return (
              <div key={p.poi_id} className="contents">
                {showMonth && <h2 className={`section-label px-1 ${i > 0 ? 'mt-3' : ''}`}>{month}</h2>}
                <StoreRow
                  index={i}
                  point={p}
                  isNew={newPoiIds.has(p.poi_id)}
                  distance={sort === 'near' ? distanceOf(p) : null}
                  showAuthor={multiAuthor}
                  myUsername={myUsername}
                  onOpen={() => setOpenId(p.poi_id)}
                />
              </div>
            )
          })}
        </div>
      </div>

      <Presence show={!!opened}>
        {opened && (
          <SheetShell onClose={() => setOpenId(null)}>
            <StoreDetail
              point={opened}
              showAuthor={multiAuthor}
              myUsername={myUsername}
              circleRole={circleRole}
              onShowOnMap={() => {
                setOpenId(null)
                onShowOnMap(opened.poi_id)
              }}
              onChanged={reload}
            />
            {canWrite && (
              <Button
                full
                className="mt-5"
                onClick={() => {
                  setOpenId(null) // 抽屉层级比全屏录入高，先收起来
                  onRecordStore(opened.poi_id)
                }}
              >
                <Icon name="edit_note" className="text-lg" /> {recordLabel(opened)}
              </Button>
            )}
          </SheetShell>
        )}
      </Presence>
      <Presence show={askOpen}>{askOpen && <AskSheet onClose={() => setAskOpen(false)} />}</Presence>
      <Presence show={filterOpen}>{filterOpen && <FilterSheet browse={browse} myUsername={myUsername} onClose={() => setFilterOpen(false)} />}</Presence>
      <Toast message={toast} />
    </div>
  )
}

const facetsStatusLabel = (s: string) => ({ fav: '想再来', fulfilled: '已兑现', repeat: '二刷以上' })[s] || s

function StoreRow({
  index,
  point,
  isNew,
  distance,
  showAuthor,
  myUsername,
  onOpen,
}: {
  index: number
  point: Point
  isNew: boolean
  distance: number | null
  showAuthor: boolean
  myUsername?: string
  onOpen: () => void
}) {
  const status = getStatus(point)
  const latest = buildTimeline(point).slice(-1)[0]
  // 头像优先用自己拍的，比高德的店面照更像回忆
  const myPhoto = latest?.type === 'visit' ? (latest.data.my_photos || '').split('|').filter(Boolean)[0] : ''
  const photo = myPhoto || (point.amap_photos || '').split('|').filter(Boolean)[0]
  const [photoOk, setPhotoOk] = useState(true)
  const by = latest?.data.recorded_by
  const byOther = showAuthor && by && by !== myUsername ? latest?.data.recorded_by_name || by : ''

  return (
    <button onClick={onOpen} className="card !rounded-[22px] relative w-full text-left p-3 flex gap-3 stagger press" style={{ '--i': index } as React.CSSProperties}>
      {status.label && <Stamp text={status.label} tone={STATUS_STAMP[status.key]} size={44} index={index} className="absolute top-2 right-2" />}
      <div className="shrink-0 w-[60px] h-[60px] rounded-2xl overflow-hidden bg-surface-2 flex items-center justify-center text-[28px]">
        {photo && photoOk ? (
          <img src={photo} alt="" loading="lazy" onError={() => setPhotoOk(false)} className="w-full h-full object-cover" />
        ) : (
          cuisineEmoji(storeCuisine(point))
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[16px] font-bold leading-snug tracking-tight line-clamp-1 ${status.label ? 'pr-11' : ''}`}>
          {isNew && <span aria-label="有新记录" className="inline-block w-2 h-2 rounded-full bg-primary align-[2px] mr-1.5" />}
          {point.name}
        </div>
        <div className={`text-xs text-on-surface-variant mt-0.5 truncate ${status.label ? 'pr-11' : ''}`}>
          {[distance != null && fmtDist(distance), point.business_area, storeCuisine(point), point.cost && `¥${point.cost}/人`].filter(Boolean).join(' · ') || (point.lng ? '' : '未定位')}
        </div>
        {latest && (
          <p className="text-[13px] text-on-surface/85 leading-snug mt-1 line-clamp-2">
            {latest.type === 'visit' ? (
              <>
                <span className="text-on-surface-variant">
                  {latest.data.mood_emoji} {prettyDate(latest.data.date)}
                  {byOther && ` · ${byOther}`}
                  {latest.data.feeling && ' · '}
                </span>
                {latest.data.feeling}
              </>
            ) : (
              <>
                <span className="text-on-surface-variant">
                  🌱 {latest.data.source}种草
                  {byOther && ` · ${byOther}`}
                  {latest.data.reason && ' · '}
                </span>
                {latest.data.reason}
              </>
            )}
          </p>
        )}
      </div>
    </button>
  )
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary-soft text-primary-dark text-xs font-semibold pl-2.5 pr-1 py-1 animate-pop-in">
      {label}
      <button onClick={onRemove} aria-label="移除" className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary/15 press-sm">
        <Icon name="close" className="text-[13px]" />
      </button>
    </span>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 mt-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card !rounded-[22px] p-3 flex gap-3" style={{ opacity: 1 - i * 0.2 }}>
          <div className="skeleton w-[60px] h-[60px] !rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2 pt-1">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-3 w-1/2" />
            <div className="skeleton h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
