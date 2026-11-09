type IconProps = Readonly<{
  /** Material Symbols 名称，如 "map" / "favorite" / "auto_awesome" */
  name: string
  /** 实心（选中态 / 需要强调时）；默认线性 */
  filled?: boolean
  className?: string
}>

/** Material Symbols Outlined 图标封装：默认线性 500 字重，filled 切实心（切换带过渡） */
export default function Icon({ name, filled = false, className = '' }: IconProps) {
  return (
    <span className={`material-symbols-outlined ${filled ? 'icon-filled' : ''} ${className}`} aria-hidden>
      {name}
    </span>
  )
}
