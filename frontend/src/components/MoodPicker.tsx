import { MOODS, MOOD_ANIM, MOOD_LABEL } from '../lib/moods'
import type { Mood } from '../lib/moods'

/** 5 档心情选择（记一笔 / 编辑弹窗共用）：选中那颗放大、带橙圈、在动，其余退成半透明。readonly 时只读展示。 */
export default function MoodPicker({
  value,
  onChange,
  readonly = false,
}: {
  value: Mood
  onChange: (m: Mood) => void
  readonly?: boolean
}) {
  return (
    <div className="flex justify-between" role="radiogroup" aria-label="好吃吗">
      {MOODS.map((m) => {
        const on = value === m
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={MOOD_LABEL[m]}
            disabled={readonly}
            onClick={() => onChange(m)}
            className={`flex flex-col items-center gap-1.5 ${readonly ? '' : 'press-sm'}`}
          >
            <span
              className={`w-[58px] h-[58px] rounded-full flex items-center justify-center text-[30px] transition-all duration-500 ease-spring ${
                on ? 'bg-white shadow-card ring-[3px] ring-primary scale-110' : 'bg-surface-2 scale-95 opacity-60 grayscale-[.35]'
              }`}
            >
              <span className={`mood-glyph ${on ? MOOD_ANIM[m] : ''}`}>{m}</span>
            </span>
            <span className={`text-[11px] transition-colors duration-300 ${on ? 'text-primary font-semibold' : 'text-on-surface-variant/70'}`}>
              {MOOD_LABEL[m]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
