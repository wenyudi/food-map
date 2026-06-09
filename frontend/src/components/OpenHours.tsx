import { openStatus, fmtOpentime } from '../lib/hours'

/** 营业时间一行：🕐 [营业中/已打烊] 原始时间 —— 地图弹窗 / 列表卡共用。
 *  营业中标绿；解析不出时间段（纯文字）就只展示原文，不瞎判断。 */
export default function OpenHours({ opentime, className = '' }: { opentime?: string; className?: string }) {
  if (!(opentime || '').trim()) return null
  const st = openStatus(opentime)
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold text-on-surface-variant ${className}`}>
      <span aria-hidden>🕐</span>
      {st && <span className={st.open ? 'text-green-accent' : 'text-primary/75'}>{st.label}</span>}
      <span className="font-normal truncate">{fmtOpentime(opentime)}</span>
    </span>
  )
}
