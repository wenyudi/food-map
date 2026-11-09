import { useCallback, useState } from 'react'
import type { Point, Wish, Visit } from '../api'
import { cleanTag, hideOnError, localDate } from '../lib/format'
import { parseDishes, dishLabel } from '../lib/taste'
import Icon from '../ui/Icon'

/** 时间线事件：种草(wish) 或 吃过(visit)，按日期排序 */
export type TimelineEvent = { type: 'wish'; date: string; data: Wish } | { type: 'visit'; date: string; data: Visit }

/** 把一个店的 wish + visits 合成按日期升序的时间线 */
export function buildTimeline(p: Point): TimelineEvent[] {
  const events: TimelineEvent[] = []
  if (p.wish) events.push({ type: 'wish', date: (p.wish.created_at || '').slice(0, 10), data: p.wish })
  p.visits.forEach((v) => events.push({ type: 'visit', date: v.date, data: v }))
  return events.sort((a, b) => a.date.localeCompare(b.date))
}

/** 日期人性化：今天 / 昨天 / 今年 M/D / 跨年 YYYY/M/D */
export function prettyDate(s?: string): string {
  if (!s) return ''
  const d = s.slice(0, 10)
  const today = localDate()
  if (d === today) return '今天'
  const yesterday = localDate(new Date(Date.now() - 86400000))
  if (d === yesterday) return '昨天'
  if (d.slice(0, 4) === today.slice(0, 4)) return d.slice(5).replace('-', '/')
  return d.replace(/-/g, '/')
}

/** 店铺状态 */
export type StoreStatus = { key: 'want' | 'fulfilled' | 'repeat' | 'direct'; label: string }

const CN_NUM = ['', '', '二', '三', '四', '五', '六', '七', '八', '九', '十']

/** 由到访次数 / 种草推断店铺状态；再访按次数叫「二刷、三刷…」 */
export function getStatus(p: Point): StoreStatus {
  if (p.visit_count === 0) return { key: 'want', label: '想去' }
  if (p.visit_count >= 2) return { key: 'repeat', label: p.visit_count > 10 ? '十刷+' : `${CN_NUM[p.visit_count]}刷` }
  if (p.wish != null) return { key: 'fulfilled', label: '兑现' }
  return { key: 'direct', label: '' } // 直奔是最普通的情况，不盖章
}

/** 状态对应的印章墨色；direct 不盖章 */
export const STATUS_STAMP: Record<StoreStatus['key'], 'primary' | 'rose' | 'sage'> = {
  want: 'rose',
  repeat: 'primary',
  fulfilled: 'sage',
  direct: 'primary',
}

/** 状态对应色值（地图 marker 外圈用，取自同一调色板） */
export const STATUS_COLOR: Record<StoreStatus['key'], string> = {
  want: '#e5788f',
  repeat: '#f4b740',
  fulfilled: '#5fa777',
  direct: '#e65c3c',
}

/** 店铺头像 emoji：吃过的用最近一顿的心情，没吃过的用 🌱（接口给的 ❤️ 和「想再来」撞了） */
export const storeEmoji = (p: Point) => (p.visit_count > 0 ? p.emoji : '🌱')

/** 店铺代表菜系：AI cuisine 优先（最近的 visit > 任意 visit > wish），回退高德 tag 第一段 */
export function storeCuisine(p: Point): string {
  const visits = p.visits || []
  for (let i = visits.length - 1; i >= 0; i--) {
    const c = (visits[i].cuisine || '').trim()
    if (c) return c
  }
  const wc = (p.wish?.cuisine || '').trim()
  if (wc) return wc
  return cleanTag(p.tag, 1)
}

type RowProps = {
  event: TimelineEvent
  onEdit: () => void
  showAuthor: boolean
  myUsername?: string
  hidePhotos?: boolean
  compact?: boolean
}

/**
 * 时间线：最近的在上，左侧心情泡泡用细线串起来（列表卡 / 地图门店卡共用）。
 * 传 limit 时只露最近几条，其余收在「展开更早的 N 条」后面。
 */
export function TimelineList({
  events,
  onEditEvent,
  limit,
  ...rest
}: Omit<RowProps, 'event' | 'onEdit'> & { events: TimelineEvent[]; onEditEvent?: (e: TimelineEvent) => void; limit?: number }) {
  const [expanded, setExpanded] = useState(false)
  const ordered = [...events].reverse()
  const shown = limit && !expanded ? ordered.slice(0, limit) : ordered
  const hidden = ordered.length - shown.length
  const left = rest.compact ? 'left-[15px] top-9' : 'left-[17px] top-10'
  return (
    <ol className="relative">
      {shown.map((e, i) => {
        const more = i < shown.length - 1 || hidden > 0
        return (
          <li key={i} className={`relative ${rest.compact ? 'pl-11' : 'pl-12'} ${more ? 'pb-4' : ''} ${limit && i >= limit ? 'animate-fade-up' : ''}`}>
            {more && <span aria-hidden className={`absolute ${left} bottom-0 w-px bg-line`} />}
            <TimelineRow event={e} onEdit={() => onEditEvent?.(e)} {...rest} />
          </li>
        )
      })}
      {hidden > 0 && (
        <li className={rest.compact ? 'pl-11' : 'pl-12'}>
          <button onClick={() => setExpanded(true)} className="flex items-center gap-0.5 text-xs font-semibold text-on-surface-variant py-1 press-sm">
            展开更早的 {hidden} 条 <Icon name="expand_more" className="text-[16px]" />
          </button>
        </li>
      )}
    </ol>
  )
}

/** 长点评：默认折到 4 行，真的放不下才出现「展开全文」 */
function Feeling({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const measure = useCallback((el: HTMLParagraphElement | null) => {
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 1)
  }, [])
  return (
    <>
      <p ref={measure} className={`text-[14px] leading-relaxed text-on-surface/90 text-pretty ${open ? '' : 'line-clamp-4'}`}>
        {text}
      </p>
      {overflow && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          className="text-xs font-semibold text-primary-dark mt-1 py-0.5 press-sm"
        >
          {open ? '收起' : '展开全文'}
        </button>
      )}
    </>
  )
}

/**
 * 单条时间线行（在 TimelineList 里渲染，左侧留出泡泡位）
 * - 种草：🌱 泡泡 + 来源 / 理由
 * - 吃过：心情泡泡 + 日期 + 花费 + 点评 + 口味 / 菜品 + 照片
 * onEdit：列表里点击进编辑；地图门店卡不传（仅图片可点开大图）
 */
export function TimelineRow({ event, onEdit, showAuthor, myUsername, hidePhotos = false, compact = false }: RowProps) {
  const by = event.data.recorded_by
  const byName = event.data.recorded_by_name || by
  // 只标别人记的：没标就是自己记的，每行都写「你记的」太吵
  const authorTag = showAuthor && by && by !== myUsername ? <span className="text-xs text-on-surface-variant">· {byName} 记的</span> : null
  const bubble = `absolute left-0 top-0 ${compact ? 'w-8 h-8 text-[17px]' : 'w-9 h-9 text-[19px]'} rounded-full flex items-center justify-center`

  if (event.type === 'wish') {
    const w = event.data
    return (
      <div onClick={onEdit} className="cursor-pointer">
        <span className={`${bubble} bg-rose-soft`}>🌱</span>
        <div className={`flex flex-wrap items-center gap-x-1.5 ${compact ? 'min-h-8' : 'min-h-9'}`}>
          <span className="text-[13px] font-semibold">{w.source}种草</span>
          <span className="text-xs text-on-surface-variant">{prettyDate(w.created_at)}</span>
          {w.status === 'visited' && <span className="text-xs font-medium text-sage-ink">已兑现</span>}
          {authorTag}
        </div>
        {w.reason && <p className="text-[14px] text-on-surface/90 leading-relaxed text-pretty">{w.reason}</p>}
      </div>
    )
  }

  const v = event.data
  const photos = (v.my_photos || '').split('|').filter(Boolean)
  const showPhotos = !hidePhotos && photos.length > 0
  const flavors = (v.flavors || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
  const dishes = parseDishes(v.dishes)
  const metaText = [v.companions, `¥${v.per_person}/人`, v.value_label].filter(Boolean).join(' · ')
  return (
    <div
      onClick={(e) => {
        // 点图片 = 看大图（交给 Lightbox）；点其它地方 = 编辑
        if ((e.target as HTMLElement).tagName !== 'IMG') onEdit()
      }}
      className="cursor-pointer"
    >
      <span className={`${bubble} bg-surface-2`}>{v.mood_emoji}</span>
      <div className={`flex flex-col justify-center ${compact ? 'min-h-8' : 'min-h-9'}`}>
        <div className="flex flex-wrap items-center gap-x-1.5">
          <span className="text-[13px] font-semibold">
            {prettyDate(v.date)} {v.meal_period}
          </span>
          {!!v.want_again && (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-ink">
              <Icon name="favorite" filled className="text-[13px]" />
              想再来
            </span>
          )}
          {v.wish_id && <span className="text-xs font-medium text-sage-ink">✨ 兑现</span>}
          {authorTag}
        </div>
        {metaText && <div className="text-xs text-on-surface-variant mt-px">{metaText}</div>}
      </div>
      {v.feeling && (
        <div className="mt-1.5">
          <Feeling key={v.feeling} text={v.feeling} />
        </div>
      )}
      {(flavors.length > 0 || dishes.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 mt-2">
          {flavors.length > 0 && <span className="text-xs text-on-surface-variant mr-1">{flavors.join(' · ')}</span>}
          {dishes.map((d) => (
            <span
              key={d.name}
              className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                d.verdict === '赞' ? 'bg-sage-soft text-sage-ink' : d.verdict === '雷' ? 'bg-primary-soft text-primary-dark' : 'bg-surface-2 text-on-surface-variant'
              }`}
            >
              {dishLabel(d)}
            </span>
          ))}
        </div>
      )}
      {showPhotos && (
        <div className="flex gap-1.5 mt-2.5 overflow-x-auto hide-scrollbar -mr-4 pr-4">
          {photos.slice(0, 4).map((u) => (
            <img key={u} src={u} alt="这顿的照片" loading="lazy" onError={hideOnError} className="zoomable w-[72px] h-[72px] shrink-0 object-cover rounded-xl bg-surface-2" />
          ))}
        </div>
      )}
    </div>
  )
}
