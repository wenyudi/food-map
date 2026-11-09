import { useEffect, useState } from 'react'
import SheetShell from '../ui/SheetShell'
import Button from '../ui/Button'
import Icon from '../ui/Icon'
import DateTimeWheel from '../ui/WheelPicker'
import PhotoPicker from '../components/PhotoPicker'
import Stepper from '../ui/Stepper'
import MoodPicker from '../components/MoodPicker'
import StoreSearchBox from '../components/StoreSearchBox'
import TasteEditor from '../components/TasteEditor'
import { inputClass } from '../lib/format'
import { parseDishes, encodeDishes } from '../lib/taste'
import type { Dish } from '../lib/taste'
import { updateVisit, deleteVisit, updateWish, deleteWish, rebindVisit, rebindWish, getPoints } from '../api'
import type { Point } from '../api'
import type { Mood } from '../lib/moods'

type Props = Readonly<{
  kind: 'visit' | 'wish'
  data: any
  storeName: string
  onClose: () => void
  onChanged: () => void
  readonly?: boolean
  recordedByName?: string
}>

export default function EditRecordSheet({ kind, data, storeName, onClose, onChanged, readonly = false, recordedByName }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  // 店选错了 → 重新搜一家换过去（店名和地图位置都以新店为准，不会脱钩）
  const [swapOpen, setSwapOpen] = useState(false)
  const [localPoints, setLocalPoints] = useState<Point[]>([])

  // 展开换店时取本圈店点（getPoints 有短 TTL 缓存，列表/地图刚加载过则秒回）——本地命中可置顶
  useEffect(() => {
    if (!swapOpen) return
    getPoints().then(setLocalPoints).catch(() => {})
  }, [swapOpen])

  const [date, setDate] = useState<string>(data.date || '')
  const [meal, setMeal] = useState<'早' | '中' | '晚'>(['早', '中', '晚'].includes(data.meal_period) ? data.meal_period : '中')
  const [amount, setAmount] = useState(String(data.amount ?? ''))
  const [people, setPeople] = useState(String(data.people_count ?? '2'))
  const [emoji, setEmoji] = useState<Mood>(data.mood_emoji || '🤤')
  const [wantAgain, setWantAgain] = useState(!!data.want_again)
  const [feeling, setFeeling] = useState(data.feeling || '')
  const [companions, setCompanions] = useState(data.companions || '')
  const [photos, setPhotos] = useState<string[]>((data.my_photos || '').split('|').filter(Boolean))
  const [source, setSource] = useState(data.source || '')
  const [reason, setReason] = useState(data.reason || '')

  // 口味标签事后修正（AI 抽错的在这里救）
  const [cuisine, setCuisine] = useState<string>(data.cuisine || '')
  const [flavors, setFlavors] = useState<string[]>((data.flavors || '').split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean))
  const [dishes, setDishes] = useState<Dish[]>(parseDishes(data.dishes))

  async function save() {
    setBusy(true)
    setErr(null)
    try {
      if (kind === 'visit') {
        await updateVisit(data.visit_id, {
          date: date || data.date,
          meal_period: meal,
          amount: Number(amount) || 0,
          people_count: Number(people) || 1,
          mood_emoji: emoji,
          want_again: wantAgain,
          feeling,
          companions,
          my_photos: photos.join('|'),
          cuisine,
          flavors,
          dishes: encodeDishes(dishes),
        })
      } else {
        await updateWish(data.wish_id, { source, reason })
      }
      onChanged()
      onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setErr(null)
    try {
      if (kind === 'visit') await deleteVisit(data.visit_id)
      else await deleteWish(data.wish_id)
      onChanged()
      onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '删除失败')
    } finally {
      setBusy(false)
    }
  }

  async function swapTo(p: any) {
    setBusy(true)
    setErr(null)
    try {
      if (kind === 'visit') await rebindVisit(data.visit_id, p)
      else await rebindWish(data.wish_id, p)
      onChanged()
      onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '换店失败')
    } finally {
      setBusy(false)
    }
  }

  const input = inputClass
  const perPerson = (() => {
    const a = Number(amount)
    const n = Number(people)
    return a > 0 && n > 0 ? Math.round((a / n) * 10) / 10 : 0
  })()

  return (
    <SheetShell onClose={onClose}>
      <div className="mb-4 pr-10">
        <h3 className="text-xl font-bold tracking-tight leading-tight">{readonly ? (kind === 'visit' ? '查看记录' : '查看想去') : kind === 'visit' ? '编辑这次记录' : '编辑想去'}</h3>
        <p className="text-sm text-on-surface-variant mt-0.5 truncate">{storeName}</p>
      </div>

      {/* 一行小操作：左 店选错了（只读时不显示），右 还想来 */}
      <div className="flex items-center justify-between gap-2 mb-4 min-h-[32px]">
        {!readonly && !swapOpen ? (
          <button onClick={() => setSwapOpen(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-on-surface-variant bg-surface-2 rounded-full px-3 py-1.5 press-sm">
            <Icon name="storefront" className="text-[15px]" /> 店选错了？
          </button>
        ) : (
          <span />
        )}
        {kind === 'visit' && (
          <button
            onClick={() => setWantAgain((a) => !a)}
            disabled={readonly}
            aria-pressed={wantAgain}
            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold press-sm transition-colors ${
              wantAgain ? 'bg-rose-soft text-rose-ink' : 'bg-surface-2 text-on-surface-variant'
            }`}
          >
            <Icon key={String(wantAgain)} name="favorite" filled={wantAgain} className="text-[14px] animate-pop-in" /> 还想来
          </button>
        )}
      </div>

      {/* 店选错了：重新搜一家，把这条记录搬过去（店名/地图位置都跟着新店走） */}
      {!readonly && swapOpen && (
        <div className="rounded-3xl bg-surface-2/70 p-3 mb-4 animate-pop-in origin-top">
          <StoreSearchBox
            city={localStorage.getItem('last_city') || '重庆'}
            localPoints={localPoints}
            initialQuery={storeName}
            placeholder="搜正确的店名"
            onPick={swapTo}
          />
          <p className="text-[11px] text-on-surface-variant mt-2">点一家，这条记录就搬过去（店名和地图位置跟着新店走）</p>
        </div>
      )}

      {readonly && (
        <div className="text-xs text-on-surface-variant text-center mb-4 bg-surface-2 rounded-full py-2">
          👀 {recordedByName || '圈友'} 记的，你只能看
        </div>
      )}
      <div className={readonly ? 'pointer-events-none select-none' : ''}>
      {kind === 'visit' ? (
        <div className="space-y-4">
          {/* 心情：5 个表情圈 */}
          <MoodPicker value={emoji} onChange={setEmoji} readonly={readonly} />

          {/* 时间滚轮 */}
          <Row label="哪天 · 哪顿">
            <DateTimeWheel value={date} onChange={setDate} meal={meal} onMealChange={setMeal} />
          </Row>

          {/* 花费 + 人数 同一行；和谁单独；点评是整段原话，给多行 */}
          <div className="grid grid-cols-[1fr_124px] gap-x-2.5 items-end">
            <Row label={!!amount && Number(people) > 0 ? `花费 · 人均 ¥${perPerson || '—'}` : '花费'}>
              <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="总价 ¥" className={input} />
            </Row>
            <Row label="人数">
              <Stepper value={Number(people) || 1} onChange={(v) => setPeople(String(v))} max={30} full />
            </Row>
          </div>
          <Row label="和谁">
            <input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="和谁一起" className={input} />
          </Row>
          <Row label="点评">
            <textarea
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              placeholder="好吃在哪？想说点啥…"
              rows={Math.min(8, Math.max(2, Math.ceil(feeling.length / 20)))}
              className={`${input} resize-none leading-relaxed`}
            />
          </Row>

          {/* 口味标签（菜系/口味/菜品赞雷，AI 抽错的在这里改） */}
          <Row label="口味标签">
            <TasteEditor
              cuisine={cuisine}
              flavors={flavors}
              dishes={dishes}
              onChange={(patch) => {
                if (patch.cuisine !== undefined) setCuisine(patch.cuisine)
                if (patch.flavors !== undefined) setFlavors(patch.flavors)
                if (patch.dishes !== undefined) setDishes(patch.dishes)
              }}
            />
          </Row>

          {/* 照片 */}
          <Row label="照片">
            <PhotoPicker photos={photos} onChange={setPhotos} max={4} />
          </Row>
        </div>
      ) : (
        <div className="space-y-3">
          <Row label="来源">
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="小红书 / 抖音 / 朋友推荐" className={input} />
          </Row>
          <Row label="理由">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="为什么想去？一句话" className={input} />
          </Row>
        </div>
      )}
      </div>

      {err && <div className="text-primary-dark text-sm bg-primary-soft rounded-2xl px-3.5 py-2.5 mt-4 animate-shake">{err}</div>}

      {readonly ? (
        <div className="mt-5">
          <Button variant="soft" full onClick={onClose}>
            关闭
          </Button>
        </div>
      ) : !confirmDel ? (
        <div className="flex gap-2.5 mt-5">
          <button
            onClick={() => setConfirmDel(true)}
            aria-label="删除"
            className="shrink-0 w-[50px] rounded-full bg-primary-soft text-primary-dark flex items-center justify-center press"
          >
            <Icon name="delete" className="text-[22px]" />
          </button>
          <Button loading={busy} onClick={save} className="flex-1">
            {busy ? '保存中…' : '保存'}
          </Button>
        </div>
      ) : (
        <div className="mt-5 text-center rounded-3xl bg-primary-soft/60 p-4 animate-pop-in">
          <p className="text-sm font-semibold text-primary-dark mb-3">确认删除？删了找不回来</p>
          <div className="flex gap-2.5">
            <Button variant="white" className="flex-1" onClick={() => setConfirmDel(false)}>
              取消
            </Button>
            <Button className="flex-1" loading={busy} onClick={remove}>
              {busy ? '删除中…' : '确认删除'}
            </Button>
          </div>
        </div>
      )}
    </SheetShell>
  )
}

function Row({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block section-label mb-1.5 px-0.5">{label}</label>
      {children}
    </div>
  )
}
