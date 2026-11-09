import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
import Button from '../ui/Button'

type Props = Readonly<{
  center: [number, number]
  storeName: string
  onPick: (lng: number, lat: number) => void
  onSkip: () => void
  onClose: () => void
}>

/** 手动加店的地图选点：拖地图把大头针对准店的位置——高德搜不到的小店也能定位上图。 */
export default function LocationPicker({ center, storeName, onPick, onSkip, onClose }: Props) {
  const mapRef = useRef<LeafletMap | null>(null)
  const [moving, setMoving] = useState(false)
  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-xl font-bold tracking-tight mb-1 pr-10">「{storeName}」在哪？</h3>
      <p className="text-sm text-on-surface-variant mb-4">拖动地图，把中间的大头针对准店的位置</p>
      <div className="relative h-[42vh] rounded-3xl overflow-hidden shadow-card ring-1 ring-line">
        <MapContainer center={center} zoom={16} className="h-full w-full" zoomControl={false}>
          <TileLayer
            url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
            subdomains={['1', '2', '3', '4']}
            maxZoom={18}
            attribution="© 高德"
          />
          <BindMap mapRef={mapRef} onMoving={setMoving} />
        </MapContainer>
        {/* 固定大头针：针尖≈地图中心（挪地图不挪针）；拖动时抬起，松手落下回弹 */}
        <span
          aria-hidden
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 rounded-full bg-black/25 blur-[2px] pointer-events-none z-[500] transition-all duration-300 ${
            moving ? 'w-2.5 opacity-50' : 'w-4 opacity-100'
          }`}
        />
        <span
          className={`absolute left-1/2 top-1/2 text-4xl leading-none pointer-events-none z-[500] drop-shadow-md transition-transform ${
            moving ? 'duration-200 ease-out' : 'duration-500 ease-spring'
          }`}
          style={{ transform: `translate(-50%, ${moving ? 'calc(-100% - 14px)' : '-92%'})` }}
        >
          📍
        </span>
      </div>
      <Button
        full
        className="mt-4"
        onClick={() => {
          const c = mapRef.current?.getCenter()
          if (c) onPick(c.lng, c.lat)
        }}
      >
        <Icon name="check" /> 就定在这里
      </Button>
      <button onClick={onSkip} className="w-full mt-1.5 text-sm font-medium text-on-surface-variant py-2 press-sm">
        先不定位（不上地图，列表照常记）
      </button>
    </SheetShell>
  )
}

/** 把 leaflet 实例绑到 ref，确认按钮读中心点用（同 MapScreen 的 MapRefBinder 模式）；顺带回报拖动状态给大头针 */
function BindMap({ mapRef, onMoving }: { mapRef: MutableRefObject<LeafletMap | null>; onMoving: (m: boolean) => void }) {
  const map = useMapEvents({
    movestart: () => onMoving(true),
    moveend: () => onMoving(false),
  })
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}
