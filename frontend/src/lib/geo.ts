/**
 * 浏览器定位 + WGS-84 → GCJ-02 坐标转换
 *
 * 浏览器 geolocation 返回的是 WGS-84，但高德 API 用 GCJ-02（火星坐标系），
 * 直接传给高德会偏 50-500m。必须本地转一下再用。
 */

const PI = Math.PI
const A = 6378245.0        // 长半轴
const EE = 0.00669342162296594323  // 偏心率平方

function outOfChina(lng: number, lat: number): boolean {
  return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55)
}

function transformLat(x: number, y: number): number {
  let r = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  r += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  r += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0
  r += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0
  return r
}

function transformLng(x: number, y: number): number {
  let r = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  r += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0
  r += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0
  r += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0
  return r
}

export function wgs84ToGcj02(lng: number, lat: number): { lng: number; lat: number } {
  if (outOfChina(lng, lat)) return { lng, lat }
  let dLat = transformLat(lng - 105.0, lat - 35.0)
  let dLng = transformLng(lng - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI)
  dLng = (dLng * 180.0) / (A / sqrtMagic * Math.cos(radLat) * PI)
  return { lng: lng + dLng, lat: lat + dLat }
}

export interface MyLocation {
  lng: number
  lat: number
  accuracy: number
}

/** 两个经纬度之间的距离（米）。双方都是 GCJ-02 时，相对距离不受坐标系偏移影响。 */
export function haversine(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * 从一堆店里挑出「主群」——你常待那片，排除出差/旅游随手记的零星远店。
 *
 * 为什么要这一步：地图初次进入会把视野框住所有点，只要混进一两家几百公里外的店，
 * 缩放就被拉到能装下整个跨度，常驻城市的店全挤成一坨、看不清「附近」。
 * 做法：以地理中位数为中心（中位数天然抗离群，不会被远点带偏），保留到中心距离在
 * 主群尺度内的点。被排除的远店仍在地图上，缩小 / 拖动就能看到，只是不参与初始框选。
 *
 * 阈值 = 到中位中心距离的中位数 ×3，下限 20km（一个大都市圈尺度，避免主群本就集中时误切）。
 * 没有离群点时所有点都会保留 → 等价于原来的「框住全部」，优雅退化。
 */
export function mainCluster<T extends { lng: number; lat: number }>(pts: T[]): T[] {
  if (pts.length <= 2) return pts
  const med = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }
  const cLng = med(pts.map((p) => p.lng))
  const cLat = med(pts.map((p) => p.lat))
  const distOf = (p: T) => haversine(cLng, cLat, p.lng, p.lat)
  const thresh = Math.max(med(pts.map(distOf)) * 3, 20000)
  const keep = pts.filter((p) => distOf(p) <= thresh)
  return keep.length ? keep : pts
}

const X_PI = (PI * 3000.0) / 180.0

/** GCJ-02 → BD-09（百度坐标系）。百度在 GCJ-02 之上又叠了一层固定偏移，
 *  不转直接喂经纬度会偏 ~200m——"能打开、却导到隔壁街"。高德/腾讯原生吃 GCJ-02，无需转。 */
export function gcj02ToBd09(lng: number, lat: number): { lng: number; lat: number } {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI)
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI)
  return { lng: z * Math.cos(theta) + 0.0065, lat: z * Math.sin(theta) + 0.006 }
}

export interface NavOption { key: string; label: string; url: string }

/** 一键导航到店：给出高德 / 百度 / 腾讯三家地图的跳转链接。
 *  店铺坐标是 GCJ-02——高德、腾讯原生直接用；百度先转 BD-09。
 *  三家都优先唤起对应 App（装了就跳 App），没装则落到各自的网页地图，点「路线」即从当前位置导航。
 *  注意经纬度顺序：高德是 lng,lat，百度/腾讯是 lat,lng。 */
export function navOptions(lng: number, lat: number, name: string): NavOption[] {
  const n = encodeURIComponent((name || '目的地').slice(0, 40))
  const bd = gcj02ToBd09(lng, lat)
  return [
    {
      key: 'amap',
      label: '高德',
      url: `https://uri.amap.com/marker?position=${lng},${lat}&name=${n}&src=chiledme&coordinate=gaode&callnative=1`,
    },
    {
      key: 'baidu',
      label: '百度',
      url: `https://api.map.baidu.com/marker?location=${bd.lat},${bd.lng}&title=${n}&content=${n}&coord_type=bd09ll&output=html&src=chiledme`,
    },
    {
      key: 'tencent',
      label: '腾讯',
      url: `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${n};addr:${n}&referer=chiledme`,
    },
  ]
}

/**
 * 拿当前位置（GCJ-02，已转好可以直接给高德用）。
 * 用户首次会被浏览器问授权；拒绝或失败时返回 null。
 */
export function getMyLocation(timeoutMs = 8000): Promise<MyLocation | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null)

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { longitude, latitude, accuracy } = pos.coords
        const { lng, lat } = wgs84ToGcj02(longitude, latitude)
        resolve({ lng, lat, accuracy })
      },
      err => {
        console.warn('[geo] 定位失败:', err.message)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 },
    )
  })
}
