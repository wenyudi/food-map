import { useRef, useState } from 'react'

type Options = Readonly<{
  /** 上拉（门店卡展开） */
  onDragUp?: () => void
  /** 轻点把手 */
  onTap?: () => void
}>

/** 拖把手下滑关闭：抽屉和地图门店卡共用。拖够远或快速下甩就关，否则回弹 */
export function useDragDismiss(onClose: () => void, disabled = false, { onDragUp, onTap }: Options = {}) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ y: number; t: number; lastY: number; lastT: number } | null>(null)

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (disabled) return
    const now = performance.now()
    drag.current = { y: e.clientY, t: now, lastY: e.clientY, lastT: now }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d) return
    d.lastY = e.clientY
    d.lastT = performance.now()
    setDragY(Math.max(0, e.clientY - d.y))
  }
  function onPointerUp() {
    const d = drag.current
    if (!d) return
    drag.current = null
    setDragging(false)
    setDragY(0)
    const dy = d.lastY - d.y
    const v = dy / Math.max(1, d.lastT - d.t) // px/ms
    if (dy > 120 || (dy > 30 && v > 0.6)) onClose()
    else if (dy < -24) onDragUp?.()
    else if (Math.abs(dy) < 6) onTap?.()
  }

  return {
    dragY,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  }
}
