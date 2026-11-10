import { useContext, useState } from 'react'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import { PresenceLeaving } from '../ui/presenceContext'
import { useDragDismiss } from '../ui/useDragDismiss'
import type { Point } from '../api'
import { useBackClose } from '../lib/useBackClose'
import { recordLabel } from '../lib/browse'
import StoreDetail from '../components/StoreDetail'

type StorePeekProps = Readonly<{
  point: Point
  showAuthor: boolean
  myUsername?: string
  circleRole?: string
  onRecordStore?: (poiId: string) => void
  onChanged: () => void
  onClose: () => void
}>

/** 地图上点开一家店：导航上方滑出的门店卡，地图还看得见。上拉展开；点地图空白 / ✕ / 下拉 / 返回键都能关 */
export default function StorePeek({ point: p, showAuthor, myUsername, circleRole, onRecordStore, onChanged, onClose }: StorePeekProps) {
  const leaving = useContext(PresenceLeaving)
  const [expanded, setExpanded] = useState(false)
  const { dragY, dragging, handlers } = useDragDismiss(() => (expanded ? setExpanded(false) : onClose()), leaving, {
    onDragUp: () => setExpanded(true),
    onTap: () => setExpanded((e) => !e),
  })
  useBackClose(!leaving, onClose)

  return (
    <div
      role="dialog"
      aria-label={p.name}
      className={`absolute inset-x-3 bottom-tabbar z-map-ui flex flex-col rounded-[20px] bg-white shadow-float ring-1 ring-[#1f1b16]/[0.08] transition-[max-height,transform] duration-500 ease-out-expo ${
        expanded ? 'max-h-[80%]' : 'max-h-[52%]'
      } ${leaving ? 'animate-peek-out pointer-events-none' : 'animate-peek-in'}`}
      style={{
        transform: dragY ? `translateY(${dragY}px)` : undefined,
        transition: dragging ? 'none' : undefined,
      }}
    >
      <div className="shrink-0 h-5 flex items-center justify-center cursor-grab touch-none" {...handlers}>
        <span className={`h-1 rounded-full transition-all duration-300 ${dragging ? 'w-12 bg-on-surface/35' : 'w-9 bg-on-surface/20'}`} />
      </div>
      <button
        onClick={onClose}
        aria-label="关闭"
        className="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-surface-2 text-on-surface-variant flex items-center justify-center press-sm"
      >
        <Icon name="close" className="text-[19px]" />
      </button>

      <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-2">
        <StoreDetail point={p} compact showAuthor={showAuthor} myUsername={myUsername} circleRole={circleRole} onChanged={onChanged} />
      </div>

      {onRecordStore && (
        <div className="shrink-0 px-4 pt-2 pb-3.5">
          <Button full className="!py-3" onClick={() => onRecordStore(p.poi_id)}>
            <Icon name="edit_note" className="text-lg" /> {recordLabel(p)}
          </Button>
        </div>
      )}
    </div>
  )
}
