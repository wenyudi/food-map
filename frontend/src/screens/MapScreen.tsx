import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import Icon from '../ui/Icon'
import StatTile from '../ui/StatTile'
import SuggestSheet from './TodaySheet'
import AreaSheet from './AreaSheet'
import { getPoints, getStats, getAreaTitles } from '../api'
import type { Point, Stats, AreaTitle } from '../api'
import { buildAreas } from '../lib/areas'
import type { Area } from '../lib/areas'
import { getMyLocation } from '../lib/geo'
import { cleanTag } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
import { TimelineRow, buildTimeline, getStatus, STATUS_COLOR } from '../components/StoreTimeline'

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))

type MapScreenProps = Readonly<{
  refreshKey: number
  focusPoiId?: string | null
  onConsumeFocus?: () => void
  onJumpToAdd?: () => void
}>

export default function MapScreen({ refreshKey, focusPoiId, onConsumeFocus, onJumpToAdd }: MapScreenProps) {
  const [points, setPoints] = useState<Point[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestFocus, setSuggestFocus] = useState<string | null>(null)
  const [trayOpen, setTrayOpen] = useState(false)
  const markerRefs = useRef<Record<string, L.Marker>>({})
  const mapRef = useRef<L.Map | null>(null)
  const [hereBusy, setHereBusy] = useState(false)

  const [areaMode, setAreaMode] = useState(false)
  const [activeArea, setActiveArea] = useState<Area | null>(null)
  const [areaTitles, setAreaTitles] = useState<Record<string, AreaTitle>>({})
  const [rerolling, setRerolling] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([getPoints(), getStats()])
      .then(([p, s]) => {
        setPoints(p)
        setStats(s)
      })
      .finally(() => setLoading(false))
  }, [refreshKey])

  const located = points.filter((p) => p.lng && p.lat)
  const unlocated = points.filter((p) => !p.lng || !p.lat)
  const center: [number, number] = located.length ? [located[0].lat, located[0].lng] : [29.56, 106.55]

  const areas = useMemo(() => buildAreas(points), [points])
  const mapAreas = areas.filter((a) => a.center)

  function enterAreaMode() {
    setAreaMode(true)
    getAreaTitles()
      .then((r) => setAreaTitles(r.areas || {}))
      .catch(() => {})
  }
  async function reroll() {
    setRerolling(true)
    try {
      const r = await getAreaTitles(true)
      setAreaTitles(r.areas || {})
    } finally {
      setRerolling(false)
    }
  }

  async function goToMyLocation() {
    const map = mapRef.current
    if (!map) return
    setHereBusy(true)
    try {
      const loc = await getMyLocation()
      if (!loc) {
        alert('定位失败 —— 可能没授权，或在 HTTP 局域网下浏览器不允许')
        return
      }
      map.flyTo([loc.lat, loc.lng], 15, { duration: 0.8 })
      const marker = L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({ html: '<div class="here-pulse"></div>', className: '', iconSize: [22, 22], iconAnchor: [11, 11] }),
        interactive: false,
        keyboard: false,
      }).addTo(map)
      setTimeout(() => marker.remove(), 5000)
    } finally {
      setHereBusy(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <main className="flex-1 relative overflow-hidden">
        {/* 地图 */}
        <MapContainer center={center} zoom={13} className="absolute inset-0 h-full w-full" zoomControl={false}>
          <TileLayer
            url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
            subdomains={['1', '2', '3', '4']}
            maxZoom={18}
            attribution="© 高德"
          />
          <FitBounds points={located} disabled={!!focusPoiId} />
          <FocusFlyer points={located} focusPoiId={focusPoiId || null} markerRefs={markerRefs} onDone={onConsumeFocus} />
          <FocusFlyer points={located} focusPoiId={suggestFocus} markerRefs={markerRefs} onDone={() => setSuggestFocus(null)} />
          {!areaMode &&
            located.map((p) => (
              <Marker
                key={p.poi_id}
                position={[p.lat, p.lng]}
                ref={(ref) => {
                  if (ref) markerRefs.current[p.poi_id] = ref
                }}
                icon={L.divIcon({
                  html: `<div class="marker-dot${getStatus(p).key === 'want' ? ' want' : ''}" style="--ring:${
                    STATUS_COLOR[getStatus(p).key]
                  }">${p.emoji}</div>`,
                  className: '',
                  iconSize: [38, 38],
                  iconAnchor: [19, 19],
                })}
              >
                <Popup maxWidth={300} minWidth={240}>
                  <PopupContent point={p} />
                </Popup>
              </Marker>
            ))}
          {areaMode &&
            mapAreas.map((a) => (
              <Marker
                key={'area-' + a.key}
                position={a.center as [number, number]}
                icon={L.divIcon({
                  html: `<div class="area-chip${a.eaten.length === 0 ? ' locked' : ''}"><span class="ac-name">${esc(
                    a.name
                  )}</span><span class="ac-count">${a.eaten.length}/${a.total}</span></div>`,
                  className: 'area-chip-wrap',
                  iconSize: [0, 0],
                  iconAnchor: [0, 0],
                })}
                eventHandlers={{ click: () => setActiveArea(a) }}
              />
            ))}
          <MapRefBinder mapRef={mapRef} />
        </MapContainer>

        {/* 顶部统计卡浮层 */}
        <div className="absolute top-0 left-0 w-full z-[400] px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pb-6 bg-gradient-to-b from-surface via-surface/80 to-transparent pointer-events-none">
          <div className="flex gap-2">
            {stats && <StatBar stats={stats} />}
            {loading &&
              [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex-1 h-14 rounded-xl border-2 border-on-surface/30 bg-white/50 animate-pulse" />
              ))}
          </div>
        </div>

        {/* 未定位入口 */}
        {!loading && unlocated.length > 0 && (
          <div className="absolute top-24 left-3 z-[400]">
            <button
              onClick={() => setTrayOpen((o) => !o)}
              className="bg-white rounded-full border-2 border-on-surface shadow-sticker-sm px-3 py-1.5 text-xs font-bold press-sm"
            >
              📍 未定位 {unlocated.length} 家 {trayOpen ? '▾' : '▸'}
            </button>
            {trayOpen && (
              <div className="mt-1 bg-white rounded-xl border-2 border-on-surface shadow-sticker-sm p-2 text-xs max-h-40 overflow-y-auto">
                {unlocated.map((p) => (
                  <div key={p.poi_id} className="py-0.5 whitespace-nowrap">
                    {p.emoji} {p.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 空状态 */}
        {!loading && points.length === 0 && (
          <div className="absolute inset-0 z-[450] flex items-center justify-center p-6">
            <div className="sticker rounded-2xl p-6 text-center max-w-[280px]">
              <div className="text-5xl mb-2">🗺️</div>
              <div className="font-headline text-xl mb-1">地图还空着</div>
              <div className="text-sm text-on-surface-variant mb-4">记下第一顿，就会在这里亮起一个点</div>
              {onJumpToAdd && (
                <button
                  onClick={onJumpToAdd}
                  className="bg-primary text-white rounded-full border-2 border-on-surface shadow-sticker px-5 py-2.5 font-headline font-bold press"
                >
                  ✏️ 去记第一笔
                </button>
              )}
            </div>
          </div>
        )}

        {/* 浮动操作（抬高 bottom-8 避开凸起的记一笔钮；奖杯 + 定位同列） */}
        <div className="absolute bottom-8 left-0 w-full px-4 flex justify-between items-end z-[450] pointer-events-none">
          <div className="w-12" />
          {!loading && points.length > 0 && (
            <button
              onClick={() => setSuggestOpen(true)}
              className="pointer-events-auto bg-primary text-white rounded-full border-[3px] border-on-surface shadow-sticker px-6 py-3 flex items-center gap-2 press font-headline font-bold text-lg tracking-wide"
            >
              <Icon name="auto_awesome" className="text-accent" />
              今天吃啥
            </button>
          )}
          <div className="flex flex-col gap-3 pointer-events-auto">
            {!loading && mapAreas.length > 0 && (
              <button
                onClick={() => (areaMode ? setAreaMode(false) : enterAreaMode())}
                className={`w-12 h-12 rounded-full border-2 border-on-surface shadow-sticker flex items-center justify-center press ${
                  areaMode ? 'bg-primary text-white' : 'bg-white'
                }`}
                title="片区版图"
              >
                <Icon name={areaMode ? 'close' : 'emoji_events'} />
              </button>
            )}
            <button
              onClick={goToMyLocation}
              className="w-12 h-12 bg-white rounded-full border-2 border-on-surface shadow-sticker flex items-center justify-center press"
              title="定位到我的位置"
            >
              {hereBusy ? (
                <span className="text-on-surface-variant">…</span>
              ) : (
                <Icon name="my_location" className="text-primary" />
              )}
            </button>
          </div>
        </div>
      </main>

      {suggestOpen && (
        <SuggestSheet
          onClose={() => setSuggestOpen(false)}
          onFocus={(id) => {
            setSuggestFocus(id)
            setSuggestOpen(false)
          }}
        />
      )}

      {activeArea && (
        <AreaSheet
          area={activeArea}
          titles={areaTitles}
          rerolling={rerolling}
          onReroll={reroll}
          onClose={() => setActiveArea(null)}
          onPickStore={(poiId) => {
            setActiveArea(null)
            setAreaMode(false)
            setSuggestFocus(poiId)
          }}
        />
      )}
    </div>
  )
}

/** 顶部统计：数字滚动 */
function StatBar({ stats }: { stats: Stats }) {
  const visits = Math.round(useCountUp(stats.total_visits))
  const stores = Math.round(useCountUp(stats.total_stores_visited))
  const wishes = Math.round(useCountUp(stats.total_wishes_open))
  const amount = Math.round(useCountUp(stats.total_amount))
  const amtTxt = amount >= 1000 ? `¥${(amount / 1000).toFixed(1)}k` : `¥${amount}`
  return (
    <div className="flex gap-2 w-full pointer-events-auto">
      <StatTile value={String(visits)} label="顿" color="text-primary" />
      <StatTile value={String(stores)} label="家店" color="text-primary-dark" />
      <StatTile value={String(wishes)} label="想去" color="text-accent" />
      <StatTile value={amtTxt} label="花费" color="text-green-accent" />
    </div>
  )
}

function FitBounds({ points, disabled }: { points: Point[]; disabled: boolean }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current) return
    if (disabled) {
      fitted.current = true
      return
    }
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [60, 60] })
      fitted.current = true
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15)
      fitted.current = true
    }
  }, [points, map, disabled])
  return null
}

function FocusFlyer({
  points,
  focusPoiId,
  markerRefs,
  onDone,
}: {
  points: Point[]
  focusPoiId: string | null
  markerRefs: React.MutableRefObject<Record<string, L.Marker>>
  onDone?: () => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!focusPoiId) return
    const p = points.find((x) => x.poi_id === focusPoiId)
    if (!p) return
    map.flyTo([p.lat, p.lng], 16, { duration: 0.8 })
    const t = setTimeout(() => {
      const m = markerRefs.current[focusPoiId]
      if (m) m.openPopup()
      onDone?.()
    }, 900)
    return () => clearTimeout(t)
  }, [focusPoiId, points, map, markerRefs, onDone])
  return null
}

/** 把 leaflet 地图实例绑到外部 ref，供浮层里的定位按钮调用 */
function MapRefBinder({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}

function PopupContent({ point: p }: { point: Point }) {
  const photos = (p.amap_photos || '').split('|').filter(Boolean).slice(0, 3)
  const timeline = buildTimeline(p).slice(-2) // 最多展示最新两次记录
  return (
    <div className="min-w-[220px]">
      {/* 头部：店名 + meta */}
      <div className="font-headline text-lg leading-tight">{p.name}</div>
      <div className="text-xs font-bold text-on-surface-variant mt-0.5">
        {[p.business_area, cleanTag(p.tag), p.rating && `⭐${p.rating}`, p.cost && `¥${p.cost}/人`].filter(Boolean).join(' · ')}
      </div>
      {/* 店铺照片：最多 3 张高德图，完整展示 */}
      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          {photos.map((u) => (
            <img key={u} src={u} className="zoomable aspect-square w-full object-cover rounded-lg border-2 border-on-surface" />
          ))}
        </div>
      )}
      {/* 时间线：复用列表 TimelineRow；弹窗不进编辑、不显作者标与用户照片，仅店铺图 */}
      <div className="mt-3 flex flex-col">
        {timeline.map((e, i) => (
          <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t-2 border-dashed border-on-surface/10' : ''}>
            <TimelineRow event={e} onEdit={() => {}} showAuthor={false} hidePhotos />
          </div>
        ))}
        {timeline.length === 0 && <div className="text-on-surface-variant text-sm mt-2">还没数据</div>}
      </div>
    </div>
  )
}
