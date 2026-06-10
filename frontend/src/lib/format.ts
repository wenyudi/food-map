// 高德返回的 tag 形如「火锅|川菜|连锁」或「小吃,甜品」——清成「火锅 · 川菜」，最多取 max 段
export function cleanTag(tag?: string, max = 2): string {
  if (!tag) return ''
  return tag
    .split(/[|,，;；]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, max)
    .join(' · ')
}

// 距离：320 → 320m；1500 → 1.5km
export function fmtDist(d?: string | number): string {
  const m = Number(d)
  if (!m || m <= 0) return ''
  return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m) + 'm'
}

// 共用输入框样式（记一笔 / 编辑 / 改密 等表单输入统一外观，避免各文件各写一份）
export const inputClass =
  'w-full rounded-xl border-2 border-on-surface bg-white px-3 py-2.5 outline-none font-body shadow-sticker-sm'

// 图片加载失败（高德图床偶尔挂 / 弱网）就整个藏掉，不留破图空框
export const hideOnError = (e: { currentTarget: HTMLImageElement }) => {
  e.currentTarget.style.display = 'none'
}
