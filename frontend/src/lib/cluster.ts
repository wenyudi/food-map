// 地图点位聚合：屏幕上挨得太近（点不到单个）的合成一团。按当前缩放级别的像素距离归组。

export interface PixelCluster<T> {
  items: T[]
  lat: number // 组内质心
  lng: number
}

export function clusterByPixels<T>(
  items: T[],
  latLngOf: (t: T) => [number, number],
  project: (ll: [number, number]) => { x: number; y: number },
  radius: number,
): PixelCluster<T>[] {
  type Group = { items: T[]; x: number; y: number }
  const groups: Group[] = items.map((it) => {
    const pt = project(latLngOf(it))
    return { items: [it], x: pt.x, y: pt.y }
  })
  // 反复合并最先发现的一对，直到没有两组的质心挨得太近（图标按质心摆，要保证不互相压）
  for (let merged = radius > 0; merged; ) {
    merged = false
    for (let i = 0; i < groups.length && !merged; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i]
        const b = groups[j]
        if (Math.hypot(a.x - b.x, a.y - b.y) < radius) {
          const n = a.items.length + b.items.length
          a.x = (a.x * a.items.length + b.x * b.items.length) / n
          a.y = (a.y * a.items.length + b.y * b.items.length) / n
          a.items.push(...b.items)
          groups.splice(j, 1)
          merged = true
          break
        }
      }
    }
  }
  return groups.map((g) => ({
    items: g.items,
    lat: g.items.reduce((s, t) => s + latLngOf(t)[0], 0) / g.items.length,
    lng: g.items.reduce((s, t) => s + latLngOf(t)[1], 0) / g.items.length,
  }))
}
