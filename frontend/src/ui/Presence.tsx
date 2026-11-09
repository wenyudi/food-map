import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PresenceLeaving } from './presenceContext'

type PresenceProps = Readonly<{
  show: boolean
  children: ReactNode
  /** 离场动画时长（ms），到点才真正卸载 */
  duration?: number
}>

/**
 * 给条件渲染补上退出动画：show 变 false 后，保留最后一帧的子树 duration 毫秒（标记为离场中）再卸载。
 * 用法：<Presence show={!!editing}>{editing && <EditRecordSheet … />}</Presence>
 */
export default function Presence({ show, children, duration = 280 }: PresenceProps) {
  // 显示中持续记住最新子树；show 翻成 false 的那一刻把它转存进 leaving，供离场期间继续渲染
  const [last, setLast] = useState<ReactNode>(show ? children : null)
  const [leaving, setLeaving] = useState<ReactNode>(null)
  const [prevShow, setPrevShow] = useState(show)

  // 渲染期派生状态（React 官方「保存上一次渲染的信息」写法）
  if (show && last !== children) setLast(children)
  if (show !== prevShow) {
    setPrevShow(show)
    setLeaving(show ? null : last)
  }

  // 卸载定时器只在离场期间存在：别在打开前留下排队的状态更新，和渲染期更新打架
  useEffect(() => {
    if (leaving == null) return
    const t = setTimeout(() => setLeaving(null), duration)
    return () => clearTimeout(t)
  }, [leaving, duration])

  if (!show && leaving == null) return null
  // 两种状态保持同一棵树形状（同一个 Provider），离场时子树不重挂、能接着播动画
  return <PresenceLeaving.Provider value={!show}>{show ? children : leaving}</PresenceLeaving.Provider>
}
