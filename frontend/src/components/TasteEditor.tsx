import { useState } from 'react'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'
import { inputClass } from '../lib/format'
import { CUISINES, FLAVORS, dishLabel } from '../lib/taste'
import type { Dish } from '../lib/taste'

/** 口味标签编辑：菜系（词表单选）/ 口味（点删 + 词表多选）/ 菜品（点击循环 无→👍→👎→删，可新增）。
 *  录入解析结果页和编辑记录弹窗共用——抽错的标签在两处都能修。 */
type TasteEditorProps = Readonly<{
  cuisine: string
  flavors: string[]
  dishes: Dish[]
  onChange: (patch: { cuisine?: string; flavors?: string[]; dishes?: Dish[] }) => void
}>

const CHIP = 'px-3 py-1.5 rounded-full border-2 border-on-surface text-sm font-bold press-sm'

export default function TasteEditor({ cuisine, flavors, dishes, onChange }: TasteEditorProps) {
  const [sheet, setSheet] = useState<null | 'cuisine' | 'flavors' | 'dish'>(null)
  const [dishName, setDishName] = useState('')

  // 菜品点击循环：无 → 赞 → 雷 → 删除
  function cycleDish(i: number) {
    const d = dishes[i]
    if (d.verdict === null) {
      onChange({ dishes: dishes.map((x, j) => (j === i ? { ...x, verdict: '赞' as const } : x)) })
    } else if (d.verdict === '赞') {
      onChange({ dishes: dishes.map((x, j) => (j === i ? { ...x, verdict: '雷' as const } : x)) })
    } else {
      onChange({ dishes: dishes.filter((_, j) => j !== i) })
    }
  }

  function addDish() {
    const name = dishName.replace(/[,:，：、]/g, '').trim()
    if (name && !dishes.some((d) => d.name === name)) {
      onChange({ dishes: [...dishes, { name, verdict: null }] })
    }
    setDishName('')
    setSheet(null)
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setSheet('cuisine')} className={`${CHIP} bg-white ${cuisine ? 'text-on-surface' : 'text-on-surface-variant/70'}`}>
          {cuisine || '＋菜系'}
        </button>
        {flavors.map((f) => (
          <button key={f} onClick={() => onChange({ flavors: flavors.filter((x) => x !== f) })} className={`${CHIP} bg-white text-on-surface-variant`}>
            🌶️ {f} ✕
          </button>
        ))}
        <button onClick={() => setSheet('flavors')} className={`${CHIP} bg-white text-on-surface-variant/70`}>
          ＋口味
        </button>
        {dishes.map((d, i) => (
          <button
            key={d.name}
            onClick={() => cycleDish(i)}
            className={`${CHIP} ${d.verdict === '赞' ? 'bg-accent text-on-surface' : d.verdict === '雷' ? 'bg-on-surface/10 text-on-surface-variant' : 'bg-white text-on-surface-variant'}`}
          >
            🍽️ {dishLabel(d)}
          </button>
        ))}
        <button onClick={() => setSheet('dish')} className={`${CHIP} bg-white text-on-surface-variant/70`}>
          ＋菜品
        </button>
      </div>
      <p className="text-[11px] text-on-surface-variant/70 mt-1.5">点菜品可标 👍赞 / 👎雷（再点一下删除）；点口味标签删除</p>

      {sheet === 'cuisine' && (
        <SheetShell onClose={() => setSheet(null)}>
          <h3 className="font-headline text-xl mb-3">这是什么菜系</h3>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange({ cuisine: c === cuisine ? '' : c })
                  setSheet(null)
                }}
                className={`${CHIP} ${c === cuisine ? 'bg-primary text-white' : 'bg-white text-on-surface'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </SheetShell>
      )}

      {sheet === 'flavors' && (
        <SheetShell onClose={() => setSheet(null)}>
          <h3 className="font-headline text-xl mb-3">口味是啥样的</h3>
          <div className="flex flex-wrap gap-2">
            {FLAVORS.map((f) => {
              const on = flavors.includes(f)
              return (
                <button
                  key={f}
                  onClick={() => onChange({ flavors: on ? flavors.filter((x) => x !== f) : [...flavors, f] })}
                  className={`${CHIP} ${on ? 'bg-primary text-white' : 'bg-white text-on-surface'}`}
                >
                  {f}
                </button>
              )
            })}
          </div>
          <StickerButton full className="mt-4" onClick={() => setSheet(null)}>
            好了
          </StickerButton>
        </SheetShell>
      )}

      {sheet === 'dish' && (
        <SheetShell onClose={() => setSheet(null)}>
          <h3 className="font-headline text-xl mb-3">加一道菜</h3>
          <input
            value={dishName}
            onChange={(e) => setDishName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDish()}
            placeholder="菜名，比如：毛肚"
            autoFocus
            className={inputClass}
          />
          <StickerButton full className="mt-4" onClick={addDish}>
            加上
          </StickerButton>
        </SheetShell>
      )}
    </>
  )
}
