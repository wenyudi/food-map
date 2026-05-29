// 5 档评分 → 本地托管的 Noto 动画 emoji（webp）。
// 非这 5 个的字符（如想去的 🤍）原样按文字渲染，避免误伤。
const CODE: Record<string, string> = {
  '😋': '1f60b',
  '🤤': '1f924',
  '😂': '1f602',
  '😐': '1f610',
  '🤮': '1f92e',
}

export default function MoodEmoji({
  emoji,
  size = 28,
  className,
}: {
  emoji?: string | null
  size?: number
  className?: string
}) {
  const code = emoji ? CODE[emoji.trim()] : undefined
  if (!code) return <>{emoji}</>
  return (
    <img
      src={`/emoji/${code}.webp`}
      alt={emoji || ''}
      width={size}
      height={size}
      draggable={false}
      className={'mood-emoji' + (className ? ' ' + className : '')}
    />
  )
}
