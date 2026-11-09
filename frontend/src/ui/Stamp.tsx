type StampProps = Readonly<{
  text: string
  tone?: 'primary' | 'rose' | 'sage'
  size?: number
  /** 砸下来（高光时刻）；默认轻轻盖上 */
  slam?: boolean
  /** 入场延迟序号，跟随卡片的错落节奏 */
  index?: number
  className?: string
}>

/** 油墨印章：吃了么？盖章答一句。样式见 tailwind.css 的 .stamp */
export default function Stamp({ text, tone = 'primary', size = 56, slam = false, index = 0, className = '' }: StampProps) {
  return (
    <span
      className={`stamp ${tone === 'primary' ? '' : `stamp-${tone}`} ${slam ? 'stamp-slam' : 'stamp-in'} ${className}`}
      style={{ '--stamp-size': `${size}px`, '--i': index } as React.CSSProperties}
    >
      {text}
    </span>
  )
}
