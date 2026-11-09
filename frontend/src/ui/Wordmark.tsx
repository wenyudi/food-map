type WordmarkProps = Readonly<{
  className?: string
}>

/** 品牌字标：吃了（咖色）+ 么（橙色）—— 站酷快乐体只在这里和回忆报告出现 */
export default function Wordmark({ className = 'text-2xl' }: WordmarkProps) {
  return (
    <h1 className={`font-display text-on-surface tracking-wide leading-none ${className}`}>
      吃了<span className="text-primary">么</span>
    </h1>
  )
}
