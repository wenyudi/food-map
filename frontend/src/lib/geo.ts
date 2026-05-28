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
