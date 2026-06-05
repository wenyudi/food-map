import { MOODS, MOOD_ANIM } from '../lib/moods'
import type { Mood } from '../lib/moods'

/** 5 档心情选择圈（记一笔 / 编辑弹窗共用）。readonly 时禁用、只读展示。 */
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
    <div className="flex justify-between">
      {MOODS.map((m) => (
        <button
          key={m}
          type="button"
          disabled={readonly}
          onClick={() => onChange(m)}
          className={`w-16 h-16 rounded-full bg-white flex items-center justify-center text-[32px] transition-all ${
            readonly ? '' : 'press'
          } ${value === m ? 'border-[3px] border-primary shadow-sticker' : 'border-2 border-on-surface shadow-sticker-sm opacity-70'}`}
        >
          <span className={`mood-glyph ${value === m ? MOOD_ANIM[m] : ''}`}>{m}</span>
        </button>
      ))}
    </div>
  )
}
