import { openStatus, fmtOpentime } from '../lib/hours'

/** 营业时间一行：● 营业中/已打烊 + 原始时间 —— 门店卡 / 列表卡共用。
 *  解析不出时间段（纯文字）就只展示原文，不瞎判断。 */
export default function OpenHours({ opentime, className = '' }: { opentime?: string; className?: string }) {
  if (!(opentime || '').trim()) return null
  const st = openStatus(opentime)
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-on-surface-variant max-w-full ${className}`}>
      {st ? (
        <span className={`inline-flex items-center gap-1 font-semibold shrink-0 ${st.open ? 'text-sage-ink' : 'text-on-surface-variant'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${st.open ? 'bg-sage' : 'bg-on-surface-variant/50'}`} />
          {st.label}
        </span>
      ) : (
        <span aria-hidden>🕐</span>
      )}
      <span className="truncate">{fmtOpentime(opentime)}</span>
    </span>
  )
}
