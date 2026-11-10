import Button from '../ui/Button'
import type { CheckIn } from '../lib/checkin'

type CheckInBannerProps = Readonly<{
  checkIn: CheckIn
  onEaten: () => void
  onSkip: () => void
}>

/** 「吃了么？」——app 的名字本身就是这句话：去过的店问一声，一点就预填好记一笔 */
export default function CheckInBanner({ checkIn, onEaten, onSkip }: CheckInBannerProps) {
  return (
    <div className="absolute inset-x-3 bottom-tabbar z-map-ui card !rounded-[20px] px-4 py-3.5 flex items-center gap-3 animate-peek-in">
      <div className="flex-1 min-w-0">
        <p className="font-hand text-[28px] leading-none">
          吃了<span className="text-primary">么</span>？
        </p>
        <p className="text-[13px] text-on-surface-variant mt-1.5 truncate">
          {checkIn.reason === 'going' ? '刚去了' : '就在'}「{checkIn.name}」{checkIn.reason === 'going' ? '吧' : '附近'}
        </p>
      </div>
      <button onClick={onSkip} className="shrink-0 text-[13px] font-medium text-on-surface-variant px-2 py-2 press-sm">
        没去
      </button>
      <Button className="shrink-0 !py-2.5 !px-5" onClick={onEaten}>
        吃了
      </Button>
    </div>
  )
}
