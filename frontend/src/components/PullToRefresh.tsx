import { useEffect, useRef, useState } from 'react'

/**
 * 下拉刷新容器（自身即滚动容器）。
 * 食物主题：下拉时一碗 🍜 随拉伸放大旋转，松手过阈值就转圈刷新。
 *
 * 关键点：touchmove 必须是「非被动」监听才能 preventDefault 掉 iOS 原生回弹，
 * 所以用 ref + addEventListener({passive:false}) 而不是 React 的 onTouchMove。
 */
export default function PullToRefresh({
  onRefresh, children, className, style,
}: {
  onRefresh: () => Promise<unknown> | unknown
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)

  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const refreshingRef = useRef(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const THRESHOLD = 64
  const MAX = 100

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const setP = (v: number) => { pullRef.current = v; setPull(v) }

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      if (el.scrollTop <= 0) { startY.current = e.touches[0].clientY; setDragging(true) }
      else startY.current = null
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current == null || refreshingRef.current) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { setP(0); return }
      if (e.cancelable) e.preventDefault()   // 压住原生回弹
      setP(Math.min(MAX, dy * 0.5))          // 阻尼
    }
    const finish = async () => {
      if (startY.current == null) return
      startY.current = null
      setDragging(false)
      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true; setRefreshing(true); setP(THRESHOLD)
        try { await onRefreshRef.current() } catch { /* 静默 */ }
        refreshingRef.current = false; setRefreshing(false); setP(0)
      } else {
        setP(0)
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', finish, { passive: true })
    el.addEventListener('touchcancel', finish, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', finish)
      el.removeEventListener('touchcancel', finish)
    }
  }, [])

  const progress = Math.min(1, pull / THRESHOLD)
  return (
    <div ref={ref} className={className} style={style}>
      <div
        className="ptr"
        style={{
          height: pull,
          opacity: pull > 0 || refreshing ? 1 : 0,
          transition: dragging ? 'none' : 'height 0.3s cubic-bezier(0.22,1,0.36,1), opacity 0.2s',
        }}
      >
        <span
          className={'ptr-noodle' + (refreshing ? ' spinning' : '')}
          style={refreshing ? undefined : { transform: `rotate(${pull * 2.6}deg) scale(${0.5 + progress * 0.5})` }}
        >🍜</span>
      </div>
      {children}
    </div>
  )
}
