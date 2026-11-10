import { useEffect, useMemo, useRef, useState } from 'react'
import { AttributionControl, MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import Icon from '../ui/Icon'
import Button, { Spinner } from '../ui/Button'
import EmptyState from '../ui/EmptyState'
import Presence from '../ui/Presence'
import ScopeBar from '../ui/ScopeBar'
import Toast from '../ui/Toast'
import SuggestSheet from './TodaySheet'
import AskSheet from './AskSheet'
import AreaSheet from './AreaSheet'
import StorePeek from './StorePeek'
import { getAreaTitles } from '../api'
import type { Point, AreaTitle } from '../api'
import { buildAreas } from '../lib/areas'
import type { Area } from '../lib/areas'
import type { Scope } from '../lib/browse'
import { clearCheckIn, findCheckIn, snoozeCheckIn, snoozeToday } from '../lib/checkin'
import type { CheckIn } from '../lib/checkin'
import { clusterByPixels } from '../lib/cluster'
import { getMyLocation, mainCluster } from '../lib/geo'
import type { Browse } from '../lib/useBrowse'
import { getStatus, STATUS_COLOR, storeEmoji } from '../components/StoreTimeline'
import CheckInBanner from '../components/CheckInBanner'
import FilterSheet from '../components/FilterSheet'

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'))

type MapScreenProps = Readonly<{
  browse: Browse
  focusPoiId?: string | null
  onConsumeFocus?: () => void
  onCompose?: () => void
  onRecordStore?: (poiId: string) => void
  onInvite?: () => void
  myUsername?: string
  circleRole?: string
}>

export default function MapScreen({ browse, focusPoiId, onConsumeFocus, onCompose, onRecordStore, onInvite, myUsername, circleRole }: MapScreenProps) {
  const { points, loading, loadError, reload, scope, setScope, filters, query, base, counts, visible, multiAuthor, activeCount, clearFilters } = browse
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [suggestFocus, setSuggestFocus] = useState<string | null>(null)
  const [trayOpen, setTrayOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null) // 点开的那家店（门店卡）
  const mapRef = useRef<L.Map | null>(null)
  const [hereBusy, setHereBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null)

  const [areaMode, setAreaMode] = useState(false)
  const [activeArea, setActiveArea] = useState<Area | null>(null)
  const [areaTitles, setAreaTitles] = useState<Record<string, AreaTitle>>({})
  const [rerolling, setRerolling] = useState(false)

  const canWrite = circleRole !== 'viewer'
  const located = useMemo(() => visible.filter((p) => p.lng && p.lat), [visible])
  const unlocated = useMemo(() => visible.filter((p) => !p.lng || !p.lat), [visible])
  const allLocated = useMemo(() => points.filter((p) => p.lng && p.lat), [points])
  const center: [number, number] = located.length ? [located[0].lat, located[0].lng] : [29.56, 106.55]

  // 片区看的是「点亮进度」，要吃过和想去都在，所以不跟随范围切换
  const areas = useMemo(() => buildAreas(base), [base])
  const mapAreas = useMemo(() => areas.filter((a) => a.center), [areas])
  const exploredAreas = areas.filter((a) => a.eaten.length > 0).length // 吃过的商圈数

  // 门店卡按 id 从全量里取：筛选藏掉它、或记录刚被改过，都拿得到最新的
  const activeStore = activeId ? allLocated.find((p) => p.poi_id === activeId) || null : null

  // 吃了么：点过导航 / 人在店门口。观光位不能记，不问
  const pointsReady = !loading && points.length > 0 && canWrite
  useEffect(() => {
    if (!pointsReady) return
    let alive = true
    findCheckIn(points).then((c) => alive && setCheckIn((prev) => prev ?? c))
    return () => {
      alive = false
    }
  }, [pointsReady, points])

  // 附近提醒一天最多问一次
  const nearbyAsked = checkIn?.reason === 'nearby' ? checkIn.poi_id : null
  useEffect(() => {
    if (nearbyAsked) snoozeToday(nearbyAsked)
  }, [nearbyAsked])

  function pickScope(key: string) {
    if (key === 'areas') {
      if (areaMode) setAreaMode(false)
      else enterAreaMode()
      return
    }
    setAreaMode(false)
    setScope(key as Scope)
  }

  function enterAreaMode() {
    setActiveId(null)
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
        setToast('定位没成功，检查下定位权限')
        setTimeout(() => setToast(null), 2200)
        return
      }
      map.flyTo([loc.lat, loc.lng], 15, { duration: 0.8 })
      const marker = L.marker([loc.lat, loc.lng], {
        icon: L.divIcon({ html: '<div class="here-pulse"></div>', className: '', iconSize: [20, 20], iconAnchor: [10, 10] }),
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
        <MapContainer center={center} zoom={13} className="absolute inset-0 h-full w-full" zoomControl={false} attributionControl={false}>
          <AttributionControl position="bottomleft" prefix={false} />
          <TileLayer
            url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
            subdomains={['1', '2', '3', '4']}
            maxZoom={18}
            attribution="© 高德"
          />
          <FitBounds points={located} disabled={!!focusPoiId} />
          <RefitOnFilter points={located} signature={`${scope}|${JSON.stringify(filters)}|${query}`} />
          <FocusFlyer points={allLocated} focusPoiId={focusPoiId || null} onPick={setActiveId} onDone={onConsumeFocus} />
          <FocusFlyer points={allLocated} focusPoiId={suggestFocus} onPick={setActiveId} onDone={() => setSuggestFocus(null)} />
          <MapBlankClick onClick={() => setActiveId(null)} />
          {!areaMode && <StoreLayer points={located} active={activeStore} onSelect={setActiveId} />}
          {areaMode && <AreaLayer areas={mapAreas} onSelect={setActiveArea} />}
          <MapRefBinder mapRef={mapRef} />
        </MapContainer>

        {/* 顶部：数字就是开关，点一下地图只看这一类 */}
        <div className="absolute top-0 inset-x-0 z-map px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pointer-events-none">
          {loading && points.length === 0 ? (
            <div className="glass rounded-[22px] py-3 flex pointer-events-auto">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5 py-0.5">
                  <span className="skeleton h-5 w-8" />
                  <span className="skeleton h-2.5 w-10" />
                </div>
              ))}
            </div>
          ) : (
            <ScopeBar
              className="glass pointer-events-auto animate-fade-up"
              active={areaMode ? 'areas' : scope}
              onPick={pickScope}
              cells={[
                { key: 'all', label: '全部', value: counts.all },
                { key: 'visited', label: '吃过', value: counts.visited },
                { key: 'want', label: '想去', value: counts.want },
                { key: 'areas', label: '商圈', value: exploredAreas },
              ]}
            />
          )}

          {/* 下面一行：左 当前筛选 / 未定位，右 筛选 */}
          <div className="mt-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0 flex flex-col items-start gap-1.5">
              {activeCount > 0 && (
                <button onClick={clearFilters} className="glass rounded-full h-9 pl-3 pr-2 text-xs font-semibold flex items-center gap-1 pointer-events-auto press-sm animate-pop-in">
                  {visible.length > 0 ? `已筛选 ${visible.length} 家` : '这个筛选下没有店'}
                  <Icon name="close" className="text-[15px] text-on-surface-variant" />
                </button>
              )}
              {!loading && unlocated.length > 0 && !areaMode && (
                <div className="pointer-events-auto w-fit animate-fade-up" style={{ animationDelay: '120ms' }}>
                  <button onClick={() => setTrayOpen((o) => !o)} className="glass rounded-full h-9 px-3 text-xs font-semibold flex items-center gap-1 press-sm">
                    <Icon name="location_off" className="text-[15px] text-on-surface-variant" />
                    未定位 {unlocated.length} 家
                    <Icon name="expand_more" className={`text-[16px] transition-transform duration-300 ${trayOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {trayOpen && (
                    <div className="glass mt-1.5 rounded-2xl p-2 text-[13px] max-h-44 overflow-y-auto origin-top-left animate-pop-in">
                      {unlocated.map((p) => (
                        <div key={p.poi_id} className="px-1.5 py-1 whitespace-nowrap">
                          {storeEmoji(p)} {p.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {!loading && points.length > 0 && (
              <button
                onClick={() => setFilterOpen(true)}
                aria-label="筛选"
                className={`relative shrink-0 w-11 h-11 rounded-full flex items-center justify-center pointer-events-auto press ${activeCount ? 'bg-on-surface text-white shadow-float' : 'glass'}`}
              >
                <Icon name="tune" className="text-[21px]" />
                {activeCount > 0 && (
                  <span key={activeCount} className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent ring-2 ring-white text-on-surface text-[10px] font-bold flex items-center justify-center animate-pop-in">
                    {activeCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 加载失败 ≠ 地图空着：明确告知 + 一键重试 */}
        {!loading && loadError && (
          <div className="absolute inset-0 z-map-ui flex items-center justify-center p-6 bg-surface/40">
            <EmptyState
              card
              emoji="📡"
              title="没连上网"
              desc="点位都好好的，连上网刷新就回来"
              action={
                <Button onClick={reload}>
                  <Icon name="refresh" /> 再试一次
                </Button>
              }
            />
          </div>
        )}

        {/* 空状态 */}
        {!loading && !loadError && points.length === 0 && (
          <div className="absolute inset-0 z-map-ui flex items-center justify-center p-6 bg-surface/40">
            <EmptyState
              card
              emoji="🗺️"
              title="地图还空着"
              desc={!canWrite ? '等记录员点亮第一家店 🍜' : '记下第一顿，就会在这里亮起一个点'}
              action={
                canWrite &&
                onCompose && (
                  <Button onClick={onCompose}>
                    <Icon name="edit" filled /> 去记第一顿
                  </Button>
                )
              }
              extra={
                canWrite &&
                onInvite && (
                  <button onClick={onInvite} className="text-sm font-medium text-on-surface-variant underline underline-offset-4 press-sm">
                    或拉饭搭子进圈一起记
                  </button>
                )
              }
            />
          </div>
        )}

        {/* 底部：今天吃啥 + 定位；门店卡 / 吃了么打开时让位，一次只问一件事 */}
        <div
          className={`absolute bottom-tabbar inset-x-0 px-4 flex justify-between items-end z-map-ui pointer-events-none transition-all duration-300 ${
            activeStore || checkIn ? 'opacity-0 translate-y-3' : ''
          }`}
        >
          <div className="w-11" />
          {!loading && points.length > 0 && (
            <button
              onClick={() => setSuggestOpen(true)}
              className={`mb-0.5 bg-primary text-white rounded-full shadow-glow pl-5 pr-6 py-3.5 flex items-center gap-2 press font-semibold text-[16px] tracking-wide animate-pop-in ${
                activeStore || checkIn ? '' : 'pointer-events-auto'
              }`}
              style={{ animationDelay: '250ms' }}
            >
              <Icon name="auto_awesome" filled className="text-accent animate-twinkle" />
              今天吃啥
            </button>
          )}
          <button
            onClick={goToMyLocation}
            className={`w-11 h-11 rounded-full flex items-center justify-center glass press ${activeStore || checkIn ? '' : 'pointer-events-auto'}`}
            aria-label="定位到我的位置"
          >
            {hereBusy ? <Spinner className="text-primary" /> : <Icon name="my_location" className="text-[21px] text-primary" />}
          </button>
        </div>

        {checkIn && !activeStore && (
          <CheckInBanner
            checkIn={checkIn}
            onEaten={() => {
              clearCheckIn()
              setCheckIn(null)
              onRecordStore?.(checkIn.poi_id)
            }}
            onSkip={() => {
              snoozeCheckIn(checkIn.poi_id)
              setCheckIn(null)
            }}
          />
        )}

        <Presence show={!!activeStore} duration={220}>
          {activeStore && (
            <StorePeek
              key={activeStore.poi_id}
              point={activeStore}
              showAuthor={multiAuthor}
              myUsername={myUsername}
              circleRole={circleRole}
              onRecordStore={canWrite ? onRecordStore : undefined}
              onChanged={reload}
              onClose={() => setActiveId(null)}
            />
          )}
        </Presence>

        <Toast message={toast} />
      </main>

      <Presence show={suggestOpen}>
        {suggestOpen && (
          <SuggestSheet
            onClose={() => setSuggestOpen(false)}
            onFocus={(id) => {
              setSuggestFocus(id)
              setSuggestOpen(false)
            }}
            onAsk={() => setAskOpen(true)}
          />
        )}
      </Presence>
      <Presence show={askOpen}>{askOpen && <AskSheet onClose={() => setAskOpen(false)} />}</Presence>
      <Presence show={filterOpen}>{filterOpen && <FilterSheet browse={browse} myUsername={myUsername} onClose={() => setFilterOpen(false)} />}</Presence>

      <Presence show={!!activeArea}>
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
      </Presence>
    </div>
  )
}

// 门店卡占下半屏：把店挪到屏幕上 1/4 处（统计条下面、卡片上面）
function focusStore(map: L.Map, p: Point, zoom = map.getZoom()) {
  const offset = map.getSize().y * 0.25
  const target = map.unproject(map.project([p.lat, p.lng], zoom).add([0, offset]), zoom)
  map.flyTo(target, zoom, { duration: 0.7 })
}

// 聚合簇点开时给统计条 / 底部按钮留出位置
const CLUSTER_FIT = { paddingTopLeft: [60, 130] as [number, number], paddingBottomRight: [60, 150] as [number, number], maxZoom: 17, duration: 0.6 }
const CLUSTER_MAX_ZOOM = 17 // 放大到这一级就不聚合了（再近的店也能点到）

function markerIcon(p: Point, active: boolean, order: number) {
  const st = getStatus(p)
  const badge = p.visit_count >= 2 ? `<span class="marker-badge">${p.visit_count}</span>` : ''
  return L.divIcon({
    html: `<div class="marker-wrap${active ? ' is-active' : ''}" style="--d:${Math.min(order, 14) * 45}ms"><div class="marker-dot${st.key === 'want' ? ' want' : ''}" style="--ring:${
      STATUS_COLOR[st.key]
    }">${esc(storeEmoji(p))}${badge}</div></div>`,
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

/** 店铺点位层：挨太近的聚合成药丸，点一下放大散开；选中的店永远单独显示（哪怕被筛选藏了） */
function StoreLayer({ points, active, onSelect }: { points: Point[]; active: Point | null; onSelect: (id: string) => void }) {
  const [zoom, setZoom] = useState<number | null>(null)
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const z = zoom ?? map.getZoom()
  const activeId = active?.poi_id ?? null

  // 进场时才错落掉落；之后放大缩小冒出来的点不再等延迟
  useEffect(() => {
    const el = map.getContainer()
    el.style.setProperty('--mk-intro', '1')
    const t = setTimeout(() => el.style.setProperty('--mk-intro', '0'), 1400)
    return () => clearTimeout(t)
  }, [map])

  // 图标按点位缓存：每次重渲染都新建 divIcon 会让 leaflet 换 DOM、动画重播
  const icons = useMemo(() => new Map(points.map((p, i) => [p.poi_id, markerIcon(p, false, i)])), [points])
  const activeIcon = useMemo(() => (active ? markerIcon(active, true, 0) : null), [active])

  const groups = useMemo(() => {
    const rest = points.filter((p) => p.poi_id !== activeId)
    const radius = z >= CLUSTER_MAX_ZOOM ? 0 : 62 // 药丸半宽 40 + 点位半径 20，保证不互相压
    return clusterByPixels(rest, (p) => [p.lat, p.lng], (ll) => map.project(ll, z), radius).map((c) => ({
      ...c,
      icon:
        c.items.length > 1
          ? L.divIcon({
              html: `<div class="cluster-pill">${[...new Set(c.items.map(storeEmoji))]
                .slice(0, 2)
                .map((e) => `<span>${esc(e)}</span>`)
                .join('')}<b>${c.items.length}</b></div>`,
              className: 'area-chip-wrap',
              iconSize: [0, 0],
              iconAnchor: [0, 0],
            })
          : null,
    }))
  }, [points, activeId, z, map])

  return (
    <>
      {groups.map((g) =>
        g.icon ? (
          <Marker
            key={'c-' + g.items[0].poi_id + '-' + g.items.length}
            position={[g.lat, g.lng]}
            icon={g.icon}
            eventHandlers={{ click: () => map.flyToBounds(L.latLngBounds(g.items.map((p) => [p.lat, p.lng] as [number, number])), CLUSTER_FIT) }}
          />
        ) : (
          <Marker
            key={g.items[0].poi_id}
            position={[g.items[0].lat, g.items[0].lng]}
            icon={icons.get(g.items[0].poi_id)}
            eventHandlers={{
              click: () => {
                focusStore(map, g.items[0])
                onSelect(g.items[0].poi_id)
              },
            }}
          />
        ),
      )}
      {active && activeIcon && <Marker key={active.poi_id} position={[active.lat, active.lng]} icon={activeIcon} zIndexOffset={1000} />}
    </>
  )
}

/** 片区层：商圈标签，同样挨太近就合并，点一下放大 */
function AreaLayer({ areas, onSelect }: { areas: Area[]; onSelect: (a: Area) => void }) {
  const [zoom, setZoom] = useState<number | null>(null)
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) })
  const z = zoom ?? map.getZoom()
  const groups = useMemo(
    () =>
      clusterByPixels(areas, (a) => a.center as [number, number], (ll) => map.project(ll, z), z >= CLUSTER_MAX_ZOOM ? 0 : 64).map((c, i) => ({
        ...c,
        icon: L.divIcon({
          html:
            c.items.length > 1
              ? `<div class="area-chip more" style="--d:${Math.min(i, 10) * 60}ms"><span class="ac-name">${c.items.length} 个商圈</span><span class="ac-count">${c.items.reduce((s, a) => s + a.eaten.length, 0)}/${c.items.reduce((s, a) => s + a.total, 0)}</span></div>`
              : `<div class="area-chip${c.items[0].eaten.length === 0 ? ' locked' : ''}" style="--d:${Math.min(i, 10) * 60}ms"><span class="ac-name">${esc(c.items[0].name)}</span><span class="ac-count">${c.items[0].eaten.length}/${c.items[0].total}</span></div>`,
          className: 'area-chip-wrap',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      })),
    [areas, z, map],
  )
  return (
    <>
      {groups.map((g) => (
        <Marker
          key={'area-' + g.items[0].key + '-' + g.items.length}
          position={[g.lat, g.lng]}
          icon={g.icon}
          eventHandlers={{
            click: () =>
              g.items.length > 1
                ? map.flyToBounds(L.latLngBounds(g.items.map((a) => a.center as [number, number])), CLUSTER_FIT)
                : onSelect(g.items[0]),
          }}
        />
      ))}
    </>
  )
}

/** 换范围 / 筛选后，把视野框到结果上（第一次由 FitBounds 负责） */
function RefitOnFilter({ points, signature }: { points: Point[]; signature: string }) {
  const map = useMap()
  const last = useRef(signature)
  const latest = useRef(points)
  useEffect(() => {
    latest.current = points
  }, [points])
  useEffect(() => {
    if (last.current === signature) return
    last.current = signature
    const pts = latest.current
    if (pts.length === 1) map.flyTo([pts[0].lat, pts[0].lng], Math.max(map.getZoom(), 15), { duration: 0.6 })
    else if (pts.length > 1) map.flyToBounds(L.latLngBounds(mainCluster(pts).map((p) => [p.lat, p.lng] as [number, number])), CLUSTER_FIT)
  }, [signature, map])
  return null
}

/** 点地图空白处：收起门店卡 */
function MapBlankClick({ onClick }: { onClick: () => void }) {
  useMapEvents({ click: onClick })
  return null
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
      // 只框「主群」，别让几百公里外的出差/旅游店把视野拉远、看不清常驻城市
      const cluster = mainCluster(points)
      const bounds = L.latLngBounds(cluster.map((p) => [p.lat, p.lng] as [number, number]))
      map.fitBounds(bounds, { paddingTopLeft: [50, 130], paddingBottomRight: [50, 150], maxZoom: 16 })
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
  onPick,
  onDone,
}: {
  points: Point[]
  focusPoiId: string | null
  onPick: (id: string) => void
  onDone?: () => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!focusPoiId || points.length === 0) return
    const p = points.find((x) => x.poi_id === focusPoiId)
    if (p) {
      focusStore(map, p, Math.max(map.getZoom(), 16))
      onPick(p.poi_id)
    }
    onDone?.()
  }, [focusPoiId, points, map, onPick, onDone])
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
