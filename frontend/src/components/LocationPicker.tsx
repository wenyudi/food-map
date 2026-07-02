import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'

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
  return (
    <SheetShell onClose={onClose}>
      <h3 className="font-headline text-xl mb-1">📍 「{storeName}」在哪？</h3>
      <p className="text-xs text-on-surface-variant mb-3">拖动地图，把中间的大头针对准店的位置</p>
      <div className="relative h-[42vh] rounded-xl border-2 border-on-surface overflow-hidden">
        <MapContainer center={center} zoom={16} className="h-full w-full" zoomControl={false}>
          <TileLayer
            url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
            subdomains={['1', '2', '3', '4']}
            maxZoom={18}
            attribution="© 高德"
          />
          <BindMap mapRef={mapRef} />
        </MapContainer>
        {/* 固定大头针：针尖≈地图中心（挪地图不挪针） */}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-4xl pointer-events-none z-[500] drop-shadow">
          📍
        </span>
      </div>
      <StickerButton
        full
        className="mt-3"
        onClick={() => {
          const c = mapRef.current?.getCenter()
          if (c) onPick(c.lng, c.lat)
        }}
      >
        ✅ 就定在这里
      </StickerButton>
      <button onClick={onSkip} className="w-full mt-1 text-sm font-bold text-on-surface-variant py-2 press-sm">
        先不定位（不上地图，列表照常记）
      </button>
    </SheetShell>
  )
}

/** 把 leaflet 实例绑到 ref，确认按钮读中心点用（同 MapScreen 的 MapRefBinder 模式） */
function BindMap({ mapRef }: { mapRef: MutableRefObject<LeafletMap | null> }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}
