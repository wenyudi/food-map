const COLORS = ['#f3cf6a', '#f2a9b8', '#a9d3b5', '#a8c8ea'] as const

/** 按字符串挑一卷胶带：同一家店每次都是同一个颜色 */
const tapeColor = (seed: string) => COLORS[[...seed].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % COLORS.length]

type TapeProps = Readonly<{
  /** 胶带颜色；不传按 seed 挑 */
  color?: string
  seed?: string
  angle?: number
  width?: number
  className?: string
}>

/** 和纸胶带：把照片 / 纸条「贴」在手账上。样式见 tailwind.css 的 .tape */
export default function Tape({ color, seed = '', angle = -6, width = 44, className = '' }: TapeProps) {
  return (
    <span
      aria-hidden
      className={`tape ${className}`}
      style={{ '--tape': color || tapeColor(seed), '--r': `${angle}deg`, '--tape-w': `${width}px` } as React.CSSProperties}
    />
  )
}
