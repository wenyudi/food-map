import { useCountUp } from '../lib/useCountUp'

type Cell = Readonly<{ key: string; label: string; value: number }>

type ScopeBarProps = Readonly<{
  cells: readonly Cell[]
  active: string
  onPick: (key: string) => void
  /** 紧凑一行（列表吸顶用）；默认数字在上、标签在下（地图用） */
  inline?: boolean
  className?: string
}>

/** 范围切换：数字就是入口，点一下地图 / 清单就只看这一类，墨色高亮块滑过去 */
export default function ScopeBar({ cells, active, onPick, inline = false, className = '' }: ScopeBarProps) {
  const idx = Math.max(0, cells.findIndex((c) => c.key === active))
  return (
    <div className={`relative flex ${inline ? 'rounded-full p-1' : 'rounded-[22px] p-1.5'} ${className}`} role="tablist">
      <span
        aria-hidden
        className={`absolute bg-on-surface transition-transform duration-500 ease-spring ${
          inline ? 'top-1 bottom-1 left-1 rounded-full' : 'top-1.5 bottom-1.5 left-1.5 rounded-2xl'
        }`}
        style={{
          width: `calc((100% - ${inline ? '0.5rem' : '0.75rem'}) / ${cells.length})`,
          transform: `translateX(${idx * 100}%)`,
        }}
      />
      {cells.map((c) => (
        <ScopeCell key={c.key} cell={c} on={c.key === active} inline={inline} onClick={() => onPick(c.key)} />
      ))}
    </div>
  )
}

function ScopeCell({ cell, on, inline, onClick }: { cell: Cell; on: boolean; inline: boolean; onClick: () => void }) {
  const value = Math.round(useCountUp(cell.value))
  const tone = on ? 'text-white' : 'text-on-surface'
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`relative flex-1 press-sm flex items-center justify-center ${inline ? 'gap-1 py-1.5' : 'flex-col py-1.5'}`}
    >
      {inline ? (
        <>
          <span className={`text-[13px] ${on ? 'font-semibold text-white' : 'font-medium text-on-surface-variant'}`}>{cell.label}</span>
          <span className={`font-num text-[13px] tabular-nums ${on ? 'font-semibold text-white/80' : 'text-on-surface-variant'}`}>{value}</span>
        </>
      ) : (
        <>
          <span className={`font-num font-semibold text-[21px] leading-none tabular-nums ${tone}`}>{value}</span>
          <span className={`mt-1 text-[11px] ${on ? 'font-semibold text-white/85' : 'text-on-surface-variant'}`}>{cell.label}</span>
        </>
      )}
    </button>
  )
}
