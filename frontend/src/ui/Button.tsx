import type { ReactNode } from 'react'

type Variant = 'primary' | 'white' | 'accent' | 'soft'

type ButtonProps = Readonly<{
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  type?: 'button' | 'submit'
  disabled?: boolean
  /** 显示转圈并禁用 */
  loading?: boolean
  full?: boolean
  className?: string
}>

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-glow',
  white: 'bg-white text-on-surface shadow-soft ring-1 ring-line',
  accent: 'bg-accent text-on-surface shadow-soft',
  soft: 'bg-surface-2 text-on-surface',
}

/** 主按钮：圆角药丸 + 柔和光晕 + 弹性按压 */
export default function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  loading = false,
  full = false,
  className = '',
}: ButtonProps) {
  const off = disabled || loading
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      className={`inline-flex items-center justify-center gap-2 rounded-full press font-semibold text-[15px] tracking-wide px-5 py-3.5
        ${disabled && !loading ? 'bg-surface-2 text-on-surface-variant/70' : VARIANT[variant]} ${full ? 'w-full' : ''}
        ${off ? 'pointer-events-none !shadow-none' : ''} ${loading ? 'opacity-70' : ''} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-4 h-4 rounded-full border-2 border-current border-r-transparent animate-spin ${className}`}
    />
  )
}
