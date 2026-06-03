type IconProps = Readonly<{
  /** Material Symbols 名称，如 "map" / "favorite" / "auto_awesome" */
  name: string
  className?: string
}>

/** Material Symbols Outlined 图标封装（填充实心，贴纸风） */
export default function Icon({ name, className = '' }: IconProps) {
  return (
    <span className={`material-symbols-outlined ${className}`} aria-hidden>
      {name}
    </span>
  )
}
