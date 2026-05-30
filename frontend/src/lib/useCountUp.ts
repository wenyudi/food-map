import { useEffect, useRef, useState } from 'react'

/**
 * 数字滚动到目标值（easeOutCubic）。
 * - 首次挂载从 0 滚到 target；之后 target 变化则从当前值滚到新值。
 * - 尊重"减少动态"系统偏好：直接显示目标，不滚。
 */
export function useCountUp(target: number, duration = 850): number {
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || duration <= 0) {
      setVal(target); fromRef.current = target
      return
    }
    const from = fromRef.current
    if (from === target) return

    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return val
}
