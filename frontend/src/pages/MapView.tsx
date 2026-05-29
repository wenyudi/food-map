import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { getPoints, getStats, getSuggest } from '../api'
import type { Point, Stats, Suggestion } from '../api'
import { getMyLocation } from '../lib/geo'
import { cleanTag } from '../lib/format'

interface Props {
  refreshKey: number
  focusPoiId?: string | null
  onConsumeFocus?: () => void
  onJumpToAdd?: () => void
}

export default function MapView({ refreshKey, focusPoiId, onConsumeFocus, onJumpToAdd }: Props) {
  const [points, setPoints] = useState<Point[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [trayOpen, setTrayOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestFocus, setSuggestFocus] = useState<string | null>(null)
  const markerRefs = useRef<Record<string, L.Marker>>({})

  useEffect(() => {
    setLoading(true)
    Promise.all([getPoints(), getStats()])
      .then(([p, s]) => { setPoints(p); setStats(s) })
      .finally(() => setLoading(false))
  }, [refreshKey])

  // 手动店可能没坐标（未定位）——地图只画有坐标的，无坐标的收进左下角入口
  const located = points.filter(p => p.lng && p.lat)
  const unlocated = points.filter(p => !p.lng || !p.lat)
  const center: [number, number] = located.length
    ? [located[0].lat, located[0].lng]
    : [29.56, 106.55]

  return (
    <div className="map-view" style={{ height: '100%', position: 'relative' }}>
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
        <FitBounds points={located} disabled={!!focusPoiId} />
        <FocusFlyer
          points={located}
          focusPoiId={focusPoiId || null}
          markerRefs={markerRefs}
          onDone={onConsumeFocus}
        />
        <FocusFlyer
          points={located}
          focusPoiId={suggestFocus}
          markerRefs={markerRefs}
          onDone={() => setSuggestFocus(null)}
        />
        {located.map(p => (
          <Marker
            key={p.poi_id}
            position={[p.lat, p.lng]}
            ref={(ref) => { if (ref) markerRefs.current[p.poi_id] = ref }}
            icon={L.divIcon({
              html: `<div class="marker-dot${p.status === 'want' ? ' want' : ''}${String(p.poi_id).startsWith('m_') ? ' manual' : ''}" style="--ring:${p.status === 'visited' ? p.color : 'var(--pink)'}">${p.emoji}</div>`,
              className: '',
              iconSize: [38, 38],
              iconAnchor: [19, 19],
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

      {loading && (
        <div className="map-stat-bar">
          {[0, 1, 2, 3].map(i => (
            <span key={i} className="skel-stat">
              <span className="skel-line" style={{ width: 26, height: 18 }} />
              <span className="skel-line" style={{ width: 30, height: 9 }} />
            </span>
          ))}
        </div>
      )}

      {!loading && unlocated.length > 0 && (
        <div className="unlocated-tray">
          <button className="unlocated-btn" onClick={() => setTrayOpen(o => !o)}>
            📍 未定位 {unlocated.length} 家 {trayOpen ? '▾' : '▸'}
          </button>
          {trayOpen && (
            <div className="unlocated-list">
              {unlocated.map(p => <div key={p.poi_id}>{p.emoji} {p.name}</div>)}
            </div>
          )}
        </div>
      )}

      {!loading && points.length === 0 && (
        <div className="map-empty">
          <div className="map-empty-card">
            <div className="map-empty-emoji">🗺️</div>
            <div className="map-empty-title">地图还空着</div>
            <div className="map-empty-sub">记下第一顿，就会在这里亮起一个点</div>
            {onJumpToAdd && (
              <button className="map-empty-btn" onClick={onJumpToAdd}>✏️ 去记第一笔</button>
            )}
          </div>
        </div>
      )}

      {!loading && points.length > 0 && (
        <button className="suggest-btn" onClick={() => setSuggestOpen(true)}>🍽️ 今天吃啥</button>
      )}

      {suggestOpen && (
        <SuggestSheet
          onClose={() => setSuggestOpen(false)}
          onFocus={(id) => { setSuggestFocus(id); setSuggestOpen(false) }}
        />
      )}
    </div>
  )
}

function SuggestSheet({ onClose, onFocus }: { onClose: () => void; onFocus: (poiId: string) => void }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Suggestion | null>(null)
  const [craving, setCraving] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function ask() {
    setLoading(true); setErr(null)
    try {
      const loc = await getMyLocation()
      const locStr = loc ? `${loc.lng},${loc.lat}` : undefined
      setData(await getSuggest(locStr, craving.trim() || undefined))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '没问出来，再试一次')
    } finally { setLoading(false) }
  }

  useEffect(() => { ask() /* 打开就先问一次 */ }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">🍽️ 今天吃啥</div>
        <div className="suggest-craving">
          <input value={craving} onChange={e => setCraving(e.target.value)}
                 placeholder="想吃点啥？清淡 / 辣 / 汤水…（可不填）"
                 onKeyDown={e => { if (e.key === 'Enter') ask() }} />
          <button onClick={ask} disabled={loading}>{loading ? '想…' : '问问'}</button>
        </div>

        {loading && <div className="as-skeleton"><span></span><span></span><span></span></div>}
        {err && <div className="add-error">{err}</div>}

        {data && !loading && (
          data.empty ? (
            <div className="suggest-empty">{data.note}</div>
          ) : (
            <>
              {data.note && <div className="suggest-note">{data.note}</div>}
              {data.picks.map(p => (
                <button key={p.poi_id} className="suggest-pick"
                        onClick={() => { if (p.has_coords) onFocus(p.poi_id) }}>
                  <div className="sp-head">
                    <span className={'ex-tag ' + (p.kind === 'wish' ? 'wish' : 'eat')}>
                      {p.kind === 'wish' ? '想去' : '想再来'}
                    </span>
                    <b>{p.name}</b>
                    {p.has_coords && <span className="sp-go">地图上看 →</span>}
                  </div>
                  <div className="sp-reason">{p.reason}</div>
                </button>
              ))}
              <button className="ghost-btn" onClick={ask} disabled={loading}>🎲 换一批</button>
            </>
          )
        )}
      </div>
    </div>
  )
}

function FitBounds({ points, disabled }: { points: Point[]; disabled: boolean }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    // 本次进入地图只自动 fit 一次：避免列表跳转 focus 消费后又被拉回全局视野（缩放乱跳）
    if (fitted.current) return
    if (disabled) { fitted.current = true; return }  // 带着 focus 进来 → 交给 flyer 定位，不要 fit
    if (points.length > 1) {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number]))
      map.fitBounds(bounds, { padding: [50, 50] })
      fitted.current = true
    } else if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15)
      fitted.current = true
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
  const tagShort = cleanTag(p.tag)
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
            <img key={u} src={u} className="zoomable" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, marginRight: 4 }} />
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
                    <img src={u} key={u} className="zoomable" />
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
