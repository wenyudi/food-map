import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getPoints, getStats } from '../api'
import type { Point, Stats } from '../api'
import { getMyLocation } from '../lib/geo'

interface Props {
  refreshKey: number
  focusPoiId?: string | null
  onConsumeFocus?: () => void
}

export default function MapView({ refreshKey, focusPoiId, onConsumeFocus }: Props) {
  const [points, setPoints] = useState<Point[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const markerRefs = useRef<Record<string, L.Marker>>({})

  useEffect(() => {
    setLoading(true)
    Promise.all([getPoints(), getStats()])
      .then(([p, s]) => { setPoints(p); setStats(s) })
      .finally(() => setLoading(false))
  }, [refreshKey])

  const center: [number, number] = points.length
    ? [points[0].lat, points[0].lng]
    : [29.56, 106.55]

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      <MapContainer
        center={center}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
          subdomains={['1', '2', '3', '4']}
          maxZoom={18}
          attribution="© 高德"
        />
        <FitBounds points={points} disabled={!!focusPoiId} />
        <FocusFlyer
          points={points}
          focusPoiId={focusPoiId || null}
          markerRefs={markerRefs}
          onDone={onConsumeFocus}
        />
        {points.map(p => (
          <Marker
            key={p.poi_id}
            position={[p.lat, p.lng]}
            ref={(ref) => { if (ref) markerRefs.current[p.poi_id] = ref }}
            icon={L.divIcon({
              html: `<div class="marker-dot${p.status === 'want' ? ' want' : ''}" style="background:${p.status === 'visited' ? p.color : '#fff'}">${p.emoji}</div>`,
              className: '',
              iconSize: [36, 36],
              iconAnchor: [18, 18],
            })}
          >
            <Popup maxWidth={280}>
              <PopupContent point={p} />
            </Popup>
          </Marker>
        ))}
        <HereButton />
      </MapContainer>

      {stats && (
        <div className="map-stat-bar">
          <span><span className="stat-ico">📍</span><b>{stats.total_visits}</b><small>次</small></span>
          <span><span className="stat-ico">🏠</span><b>{stats.total_stores_visited}</b><small>家</small></span>
          <span><span className="stat-ico">🤍</span><b>{stats.total_wishes_open}</b><small>想去</small></span>
          <span><span className="stat-ico">💵</span><b>¥{stats.total_amount.toFixed(0)}</b><small>总花</small></span>
        </div>
      )}

      {loading && <div className="loading">加载中…</div>}
    </div>
  )
}

function FitBounds({ points, disabled }: { points: Point[]; disabled: boolean }) {
  const map = useMap()
  useEffect(() => {
    if (disabled) return
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [50, 50] })
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15)
    }
  }, [points, map, disabled])
  return null
}

function FocusFlyer({ points, focusPoiId, markerRefs, onDone }: {
  points: Point[]
  focusPoiId: string | null
  markerRefs: React.MutableRefObject<Record<string, L.Marker>>
  onDone?: () => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!focusPoiId) return
    const p = points.find(x => x.poi_id === focusPoiId)
    if (!p) return
    map.flyTo([p.lat, p.lng], 16, { duration: 0.8 })
    // 等动画结束打开 popup
    const t = setTimeout(() => {
      const m = markerRefs.current[focusPoiId]
      if (m) m.openPopup()
      onDone?.()
    }, 900)
    return () => clearTimeout(t)
  }, [focusPoiId, points, map, markerRefs, onDone])
  return null
}

function HereButton() {
  const map = useMap()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      const loc = await getMyLocation()
      if (!loc) {
        alert('定位失败 —— 可能没授权，或在 HTTP 局域网下浏览器不允许')
        return
      }
      map.flyTo([loc.lat, loc.lng], 15, { duration: 0.8 })
      // 临时脉冲 marker
      const marker = L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({
          html: '<div class="here-pulse"></div>',
          className: '',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        interactive: false,
        keyboard: false,
      }).addTo(map)
      setTimeout(() => marker.remove(), 5000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      className={'here-btn' + (busy ? ' busy' : '')}
      onClick={handleClick}
      title="定位到我的位置"
    >
      {busy ? '…' : '📍'}
    </button>
  )
}

function PopupContent({ point: p }: { point: Point }) {
  const tagShort = p.tag && p.tag.length > 30 ? p.tag.slice(0, 30) + '…' : p.tag
  const photos = (p.amap_photos || '').split('|').filter(Boolean).slice(0, 3)

  type Ev = { type: 'wish' | 'visit'; date: string; data: any }
  const events: Ev[] = []
  if (p.wish) events.push({ type: 'wish', date: (p.wish.created_at || '').slice(0, 10), data: p.wish })
  p.visits.forEach(v => events.push({ type: 'visit', date: v.date, data: v }))
  events.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div>
      <h4>{p.name}</h4>
      <div className="meta">
        {p.business_area && `${p.business_area}`}
        {tagShort && ` · ${tagShort}`}
        {p.rating && ` · ⭐${p.rating}`}
        {p.cost && ` · ¥${p.cost}/人`}
      </div>
      {photos.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {photos.map(u => (
            <img key={u} src={u} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, marginRight: 4 }} />
          ))}
        </div>
      )}

      <div className="popup-timeline">
        {events.map((e, i) => e.type === 'wish' ? (
          <div className="pt-row" key={i}>
            <span className="pt-emoji">🤍</span>
            <div className="pt-text-wrap">
              <div className="pt-line">
                <span className="pt-date">{e.date.slice(5).replace('-', '/')}</span>
                <span className="pt-src">{e.data.source}种草</span>
                {e.data.status === 'visited' && <span className="pt-pill">已兑现</span>}
              </div>
              {e.data.reason && <div className="pt-content">{e.data.reason}</div>}
            </div>
          </div>
        ) : (
          <div className="pt-row" key={i}>
            <span className="pt-emoji">{e.data.mood_emoji}</span>
            <div className="pt-text-wrap">
              <div className="pt-line">
                <span className="pt-date">{e.date.slice(5).replace('-', '/')}</span>
                <span className="pt-src">¥{e.data.per_person}/人{e.data.value_label ? ' · ' + e.data.value_label : ''}</span>
                {e.data.wish_id && <span className="pt-pill warm">兑现 ✨</span>}
                {!!e.data.want_again && <span className="pt-star">⭐</span>}
              </div>
              {e.data.feeling && <div className="pt-content">{e.data.feeling}</div>}
              {e.data.my_photos && (
                <div className="pt-photos">
                  {(e.data.my_photos as string).split('|').filter(Boolean).slice(0, 3).map((u: string) => (
                    <img src={u} key={u} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {events.length === 0 && <div style={{ color: '#aaa', marginTop: 8 }}>还没数据</div>}
      </div>
    </div>
  )
}
