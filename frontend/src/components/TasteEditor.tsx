import { useState } from 'react'
import SheetShell from '../ui/SheetShell'
import Presence from '../ui/Presence'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
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

const CHIP = 'chip press-sm'
const ADD = 'bg-transparent text-on-surface-variant border border-dashed border-on-surface-variant/40 !py-[5px]'

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
        <button onClick={() => setSheet('cuisine')} className={`${CHIP} ${cuisine ? 'bg-on-surface text-white' : ADD}`}>
          {cuisine || '＋ 菜系'}
        </button>
        {flavors.map((f) => (
          <button key={f} onClick={() => onChange({ flavors: flavors.filter((x) => x !== f) })} className={`${CHIP} bg-white ring-1 ring-line animate-pop-in`}>
            {f} <Icon name="close" className="text-[14px] text-on-surface-variant" />
          </button>
        ))}
        <button onClick={() => setSheet('flavors')} className={`${CHIP} ${ADD}`}>
          ＋ 口味
        </button>
        {dishes.map((d, i) => (
          <button
            key={d.name}
            onClick={() => cycleDish(i)}
            className={`${CHIP} animate-pop-in ${
              d.verdict === '赞' ? 'bg-sage-soft text-sage-ink' : d.verdict === '雷' ? 'bg-primary-soft text-primary-dark' : 'bg-white ring-1 ring-line'
            }`}
          >
            <span key={d.verdict || 'none'} className="inline-block animate-pop-in">
              {dishLabel(d)}
            </span>
          </button>
        ))}
        <button onClick={() => setSheet('dish')} className={`${CHIP} ${ADD}`}>
          ＋ 菜品
        </button>
      </div>
      <p className="text-[11px] text-on-surface-variant/70 mt-2 px-0.5">点菜品标 👍 赞 / 👎 雷，再点一下删除；点口味删除</p>

      <Presence show={sheet === 'cuisine'}>
      {sheet === 'cuisine' && (
        <SheetShell onClose={() => setSheet(null)}>
          <h3 className="text-xl font-bold tracking-tight mb-4">这是什么菜系</h3>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onChange({ cuisine: c === cuisine ? '' : c })
                  setSheet(null)
                }}
                className={`${CHIP} ${c === cuisine ? 'chip-on' : 'bg-white ring-1 ring-line'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </SheetShell>
      )}
      </Presence>

      <Presence show={sheet === 'flavors'}>
      {sheet === 'flavors' && (
        <SheetShell onClose={() => setSheet(null)}>
          <h3 className="text-xl font-bold tracking-tight mb-4">口味是啥样的</h3>
          <div className="flex flex-wrap gap-2">
            {FLAVORS.map((f) => {
              const on = flavors.includes(f)
              return (
                <button
                  key={f}
                  onClick={() => onChange({ flavors: on ? flavors.filter((x) => x !== f) : [...flavors, f] })}
                  className={`${CHIP} ${on ? 'chip-on' : 'bg-white ring-1 ring-line'}`}
                >
                  {f}
                </button>
              )
            })}
          </div>
          <Button full className="mt-5" onClick={() => setSheet(null)}>
            好了
          </Button>
        </SheetShell>
      )}
      </Presence>

      <Presence show={sheet === 'dish'}>
      {sheet === 'dish' && (
        <SheetShell onClose={() => setSheet(null)}>
          <h3 className="text-xl font-bold tracking-tight mb-4">加一道菜</h3>
          <input
            value={dishName}
            onChange={(e) => setDishName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDish()}
            placeholder="菜名，比如：毛肚"
            autoFocus
            className={inputClass}
          />
          <Button full className="mt-5" onClick={addDish}>
            加上
          </Button>
        </SheetShell>
      )}
      </Presence>
    </>
  )
}
