import { useContext } from 'react'
import { createPortal } from 'react-dom'
import Presence from './Presence'
import { PresenceLeaving } from './presenceContext'

/** 轻提示：底部（导航和地图主按钮上方）弹出，消失时淡出。message 为 null 即隐藏 */
export default function Toast({ message }: Readonly<{ message: string | null }>) {
  return (
    <Presence show={!!message} duration={220}>
      {message && <ToastBody text={message} />}
    </Presence>
  )
}

function ToastBody({ text }: { text: string }) {
  const leaving = useContext(PresenceLeaving)
  return createPortal(
    <div
      role="status"
      className={`fixed left-1/2 -translate-x-1/2 z-toast max-w-[86vw] rounded-full bg-on-surface/90 text-white px-4 py-2.5 text-sm font-medium shadow-float whitespace-nowrap ${
        leaving ? 'animate-toast-out' : 'animate-toast-in'
      }`}
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 10rem)', WebkitBackdropFilter: 'blur(8px)', backdropFilter: 'blur(8px)' }}
    >
      {text}
    </div>,
    document.body,
  )
}
