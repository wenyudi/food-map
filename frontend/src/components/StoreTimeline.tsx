import type { Point, Wish, Visit } from '../api'
import { cleanTag, hideOnError } from '../lib/format'
import { parseDishes, dishLabel } from '../lib/taste'

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
  const today = new Date().toISOString().slice(0, 10)
  if (d === today) return '今天'
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (d === yesterday) return '昨天'
  if (d.slice(0, 4) === today.slice(0, 4)) return d.slice(5).replace('-', '/')
  return d.replace(/-/g, '/')
}

/** 店铺状态（与列表标签一致） */
export type StoreStatus = { key: 'want' | 'fulfilled' | 'repeat' | 'direct'; icon: string; label: string }

/** 由到访次数 / 种草推断店铺状态 */
export function getStatus(p: Point): StoreStatus {
  if (p.visit_count === 0) return { key: 'want', icon: '❤️', label: '种草中' }
  if (p.visit_count >= 2) return { key: 'repeat', icon: '🔁', label: '二刷' }
  if (p.wish != null) return { key: 'fulfilled', icon: '✨', label: '已兑现' }
  return { key: 'direct', icon: '📍', label: '直奔' }
}

/** 状态标签配色（Tailwind class，列表底栏药丸用） */
export const STATUS_TONE: Record<StoreStatus['key'], string> = {
  want: 'bg-tertiary text-on-surface',
  repeat: 'bg-accent text-on-surface',
  fulfilled: 'bg-green-accent text-white',
  direct: 'bg-white text-on-surface-variant',
}

/** 状态对应色值（地图 marker 圆圈用，取自同一调色板） */
export const STATUS_COLOR: Record<StoreStatus['key'], string> = {
  want: '#f9c8c0',
  repeat: '#ffc857',
  fulfilled: '#4CAF50',
  direct: '#ffffff',
}

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

/**
 * 单条时间线行（列表 / 地图弹窗共用）
 * - 种草：虚线便签框
 * - 吃过：表情圈 + 日期(对齐表情顶) + 想再来标签 + 药丸(对齐表情底) + 便签框(口味/菜品/照片)
 * onEdit：列表里点击进编辑；地图弹窗传 no-op（仅图片可点开大图）
 */
export function TimelineRow({
  event,
  onEdit,
  showAuthor,
  myUsername,
  hidePhotos = false,
}: {
  event: TimelineEvent
  onEdit: () => void
  showAuthor: boolean
  myUsername?: string
  hidePhotos?: boolean
}) {
  const by = event.data.recorded_by
  const byName = event.data.recorded_by_name || by
  const authorTag =
    showAuthor && by ? (
      <span className="text-[10px] font-bold text-on-surface-variant bg-surface rounded px-1">
        {by === myUsername ? '你记的' : `${byName} 记的`}
      </span>
    ) : null

  if (event.type === 'wish') {
    const w = event.data
    return (
      <div onClick={onEdit} className="border-2 border-dashed border-on-surface/25 rounded-xl px-3 py-1.5 bg-surface/40 cursor-pointer transition-opacity active:opacity-70">
        <div className="text-sm leading-relaxed">
          <span className="font-bold text-on-surface-variant">{w.source}种草</span>
          {w.reason && <> · {w.reason}</>}
          <span className="text-xs font-bold text-on-surface-variant"> · {prettyDate(w.created_at)}</span>
          {w.status === 'visited' && <span className="ml-1 text-xs font-bold bg-green-accent/15 text-green-accent rounded px-1">已兑现</span>}
          {authorTag}
        </div>
      </div>
    )
  }

  const v = event.data
  const photos = (v.my_photos || '').split('|').filter(Boolean)
  const showPhotos = !hidePhotos && photos.length > 0
  const flavors = (v.flavors || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean)
  const dishes = parseDishes(v.dishes)
  const metaText = [v.companions, `¥${v.per_person}/人`, v.value_label].filter(Boolean).join(' · ')
  const chip = 'inline-flex items-center align-middle ml-1.5 text-xs font-bold text-on-surface-variant bg-white border border-on-surface/15 rounded-full px-2 py-0.5'
  return (
    <div className="relative">
      {/* 表情 + 右列：日期对齐表情顶、药丸对齐表情底；药丸与日期左对齐、z-10 压在虚线框上层；整体右移 ml-2 */}
      <div className="flex items-stretch gap-2.5 ml-2">
        <span
          onClick={onEdit}
          className="relative z-10 w-10 h-10 rounded-full border-2 border-on-surface bg-white flex items-center justify-center text-xl shrink-0 shadow-sticker-sm cursor-pointer"
        >
          {v.mood_emoji}
        </span>
        <div className="min-w-0 flex flex-col justify-between">
          <div onClick={onEdit} className="flex flex-wrap items-center gap-1.5 cursor-pointer transition-opacity active:opacity-70">
            <span className="text-xs font-bold text-on-surface-variant">
              {prettyDate(v.date)} {v.meal_period}
            </span>
            {!!v.want_again && <span className="text-xs font-bold bg-primary/15 text-primary rounded px-1">想再来 ❤️</span>}
            {v.wish_id && <span className="text-xs font-bold bg-primary/15 text-primary rounded px-1">兑现 ✨</span>}
            {authorTag}
          </div>
          {metaText && (
            <div
              onClick={onEdit}
              className="relative z-10 self-start inline-flex items-center text-xs font-bold text-on-surface-variant bg-surface border border-on-surface/15 rounded-full px-2 py-0.5 cursor-pointer"
            >
              {metaText}
            </div>
          )}
        </div>
      </div>
      {/* 备注框：顶边从药丸正中穿过（药丸压在上层）；图片也放进框里 */}
      {(v.feeling || flavors.length > 0 || dishes.length > 0 || showPhotos) && (
        <div
          onClick={(e) => {
            // 点图片 = 看大图（交给 Lightbox）；点其它文字/标签 = 编辑
            if ((e.target as HTMLElement).tagName !== 'IMG') onEdit()
          }}
          className={`border-2 border-dashed border-on-surface/25 rounded-xl px-3 pb-2 bg-surface/40 text-sm text-on-surface leading-relaxed cursor-pointer transition-opacity active:opacity-70 ${metaText ? '-mt-3 pt-4' : 'mt-1.5 pt-2'}`}
        >
          {v.feeling}
          {flavors.map((f) => (
            <span key={'f' + f} className={chip}>🌶️ {f}</span>
          ))}
          {dishes.map((d) => (
            <span
              key={'d' + d.name}
              className={`${chip} ${d.verdict === '赞' ? '!text-green-accent' : d.verdict === '雷' ? '!text-primary/80' : ''}`}
            >
              🍽️ {dishLabel(d)}
            </span>
          ))}
          {showPhotos && (
            <div className={`flex flex-wrap gap-1.5 ${v.feeling || flavors.length > 0 || dishes.length > 0 ? 'mt-2' : ''}`}>
              {photos.slice(0, 4).map((u) => (
                <img key={u} src={u} loading="lazy" onError={hideOnError} className="zoomable w-16 h-16 object-cover rounded-lg border-2 border-on-surface" />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
