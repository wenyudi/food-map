import type { ReactNode } from 'react'

type Variant = 'primary' | 'white' | 'accent'

type StickerButtonProps = Readonly<{
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  type?: 'button' | 'submit'
  disabled?: boolean
  full?: boolean
  className?: string
}>

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white',
  white: 'bg-white text-on-surface',
  accent: 'bg-accent text-on-surface',
}

/** 贴纸主按钮：圆角药丸 + 描边 + 硬阴影 + 按压 */
export default function StickerButton({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  full = false,
  className = '',
}: StickerButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full border-2 border-on-surface shadow-sticker press
        font-headline font-bold tracking-wide px-5 py-3
        ${VARIANT[variant]} ${full ? 'w-full' : ''}
        ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
    >
      {children}
    </button>
  )
}
