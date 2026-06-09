// 营业时间：从高德 opentime 串解析时间段，判断此刻是否营业。
// 高德 opentime 多为今日营业（"09:00-22:00" 或 "10:30-14:00 17:00-21:30"），
// 偶尔是 "周一至周日 09:00-22:00" 这类周描述。我们尽力抽时间段，抽不到只展示原文。

export type OpenStatus = { open: boolean; label: string }

const RANGE_RE = /(\d{1,2}):(\d{2})\s*[-–~至到]\s*(\d{1,2}):(\d{2})/g

/** 此刻营业状态。能抽到时间段→营业中/已打烊；纯文字描述抽不到→null（只展示原文）。 */
export function openStatus(opentime?: string, now: Date = new Date()): OpenStatus | null {
  const s = (opentime || '').trim()
  if (!s) return null
  if (/24\s*小时|全天|00:00\s*[-–~]\s*24:00/.test(s)) return { open: true, label: '营业中' }
  const cur = now.getHours() * 60 + now.getMinutes()
  let matched = false
  RANGE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = RANGE_RE.exec(s)) !== null) {
    matched = true
    const start = +m[1] * 60 + +m[2]
    const end = +m[3] * 60 + +m[4]
    // end<=start 视为跨夜营业（如 18:00-02:00）
    const within = end > start ? cur >= start && cur < end : cur >= start || cur < end
    if (within) return { open: true, label: '营业中' }
  }
  return matched ? { open: false, label: '已打烊' } : null
}

/** 展示用：压缩多余空白，过长截断。 */
export function fmtOpentime(opentime?: string, max = 26): string {
  const s = (opentime || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}
