import { useState } from 'react'
import Icon from '../ui/Icon'
import Presence from '../ui/Presence'
import Stamp from '../ui/Stamp'
import Toast from '../ui/Toast'
import EditRecordSheet from '../screens/EditRecordSheet'
import OpenHours from './OpenHours'
import { TimelineList, buildTimeline, getStatus, STATUS_STAMP, storeCuisine } from './StoreTimeline'
import type { Point, Visit, Wish } from '../api'
import { markGoing } from '../lib/checkin'
import { cleanTag, hideOnError } from '../lib/format'
import { navOptions } from '../lib/geo'

function buildShareText(p: Point): string {
  const lines: string[] = [`📍「${p.name}」`]
  const meta = [p.business_area, cleanTag(p.tag), p.cost && `人均¥${p.cost}`].filter(Boolean).join(' · ')
  if (meta) lines.push(meta)
  const lastVisit = [...p.visits].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0]
  if (lastVisit) lines.push([lastVisit.mood_emoji, lastVisit.feeling].filter(Boolean).join(' ') || '记过一笔')
  else if (p.wish?.reason) lines.push(`想去：${p.wish.reason}`)
  lines.push('—— 来自我的美食地图')
  return lines.join('\n')
}

type EditTarget = { kind: 'visit' | 'wish'; data: Visit | Wish }

type StoreDetailProps = Readonly<{
  point: Point
  showAuthor: boolean
  myUsername?: string
  circleRole?: string
  /** 地图上的门店卡用紧凑版 */
  compact?: boolean
  /** 列表进来时才有「地图上看」 */
  onShowOnMap?: () => void
  onChanged: () => void
}>

/** 一家店的全部：地图门店卡和列表详情都是这一份。看信息、导航、分享、翻记录、改记录 */
export default function StoreDetail({ point: p, showAuthor, myUsername, circleRole, compact = false, onShowOnMap, onChanged }: StoreDetailProps) {
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const status = getStatus(p)
  const photos = (p.amap_photos || '').split('|').filter(Boolean).slice(0, 3)
  const hasCoords = !!(p.lng && p.lat)
  const isManual = String(p.poi_id).startsWith('m_')

  async function share() {
    const text = buildShareText(p)
    try {
      if (navigator.share) await navigator.share({ title: p.name, text })
      else {
        await navigator.clipboard.writeText(text)
        setToast('已复制，粘贴给朋友吧')
        setTimeout(() => setToast(null), 1800)
      }
    } catch {
      /* 用户取消 */
    }
  }

  const iconBtn = 'shrink-0 w-9 h-9 rounded-full bg-surface-2 text-on-surface flex items-center justify-center press-sm'

  return (
    <>
      <div className="relative">
        {status.label && <Stamp text={status.label} tone={STATUS_STAMP[status.key]} size={50} className="absolute top-0 right-9" />}
        <h3 className={`text-[18px] font-bold leading-snug tracking-tight line-clamp-2 ${status.label ? 'pr-[6rem]' : 'pr-10'}`}>
          {p.name}
          {isManual && <span className="ml-1.5 text-[10px] font-medium text-on-surface-variant bg-surface-2 rounded px-1 py-px align-middle">手动</span>}
        </h3>
        <div className="text-xs text-on-surface-variant mt-1">
          {[p.business_area, storeCuisine(p), p.rating && `⭐ ${p.rating}`, p.cost && `¥${p.cost}/人`].filter(Boolean).join(' · ')}
        </div>
        <OpenHours opentime={p.opentime} className="mt-0.5" />
      </div>

      {/* 操作：导航 + 地图 + 分享 */}
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {hasCoords ? (
          <>
            <Icon name="near_me" filled className="text-[15px] text-primary" />
            <span className="text-on-surface-variant mr-0.5">导航</span>
            {navOptions(p.lng, p.lat, p.name).map((opt) => (
              <a
                key={opt.key}
                href={opt.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => markGoing(p)}
                className="rounded-full bg-surface-2 px-2.5 py-1.5 font-medium text-on-surface press-sm"
              >
                {opt.label}
              </a>
            ))}
          </>
        ) : (
          <span className="flex items-center gap-1 text-on-surface-variant">
            <Icon name="location_off" className="text-[15px]" /> 这家还没定位，地图上看不到
          </span>
        )}
        <span className="flex-1" />
        {hasCoords && onShowOnMap && (
          <button onClick={onShowOnMap} aria-label="地图上看" className={iconBtn}>
            <Icon name="map" className="text-[19px]" />
          </button>
        )}
        <button onClick={share} aria-label="分享" className={iconBtn}>
          <Icon name="ios_share" className="text-[18px]" />
        </button>
      </div>

      {photos.length > 0 && (
        <div className="flex gap-1.5 mt-3 overflow-x-auto hide-scrollbar">
          {photos.map((u) => (
            <img key={u} src={u} alt={p.name} loading="lazy" onError={hideOnError} className="zoomable w-[84px] h-[84px] shrink-0 object-cover rounded-xl bg-surface-2" />
          ))}
        </div>
      )}

      <div className="mt-4">
        <TimelineList
          events={buildTimeline(p)}
          limit={3}
          compact={compact}
          onEditEvent={(e) => setEditing({ kind: e.type, data: e.data })}
          showAuthor={showAuthor}
          myUsername={myUsername}
        />
      </div>

      <Presence show={!!editing}>
        {editing && (
          <EditRecordSheet
            kind={editing.kind}
            data={editing.data}
            storeName={p.name}
            onClose={() => setEditing(null)}
            onChanged={onChanged}
            readonly={!(!editing.data.recorded_by || editing.data.recorded_by === myUsername || circleRole === 'owner')}
            recordedByName={editing.data.recorded_by_name}
          />
        )}
      </Presence>
      <Toast message={toast} />
    </>
  )
}
