type WordmarkProps = Readonly<{
  className?: string
}>

/** 品牌字标：吃了（咖色）+ 么（橙色）—— 全站统一着色，杜绝逐屏飘移 */
export default function Wordmark({ className = 'text-2xl' }: WordmarkProps) {
  return (
    <h1 className={`font-headline font-black text-on-surface tracking-tight leading-none ${className}`}>
      吃了<span className="text-primary">么</span>
    </h1>
  )
}
