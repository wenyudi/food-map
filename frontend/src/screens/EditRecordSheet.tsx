import { useState } from 'react'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'
import DateTimeWheel, { NumberWheel } from '../ui/WheelPicker'
import PhotoPicker from '../components/PhotoPicker'
import { updateVisit, deleteVisit, updateWish, deleteWish } from '../api'

type Mood = '😋' | '🤤' | '😂' | '😐' | '🤮'
const EMOJI_OPTIONS: Mood[] = ['😋', '🤤', '😂', '😐', '🤮']
const MOOD_ANIM: Record<Mood, string> = {
  '😋': 'm-yum',
  '🤤': 'm-drool',
  '😂': 'm-laugh',
  '😐': 'm-meh',
  '🤮': 'm-vomit',
}

type Props = Readonly<{
  kind: 'visit' | 'wish'
  data: any
  storeName: string
  onClose: () => void
  onChanged: () => void
}>

export default function EditRecordSheet({ kind, data, storeName, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

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

  const input = 'w-full rounded-xl border-2 border-on-surface bg-white px-3 py-2 outline-none font-body shadow-sticker-sm'
  const perPerson = (() => {
    const a = Number(amount)
    const n = Number(people)
    return a > 0 && n > 0 ? Math.round((a / n) * 10) / 10 : 0
  })()

  return (
    <SheetShell onClose={onClose}>
      <h3 className="font-headline text-xl mb-1">{kind === 'visit' ? '编辑这次记录' : '编辑想去'}</h3>
      <p className="text-sm text-on-surface-variant mb-4">{storeName}</p>

      {kind === 'visit' ? (
        <div className="space-y-4">
          {/* 心情：大圆圈，选中橙边白底（同录入详情页） */}
          <div>
            <p className="font-headline text-lg mb-2">这一顿，好吃吗？</p>
            <div className="flex justify-between">
              {EMOJI_OPTIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => setEmoji(o)}
                  className={`w-14 h-14 rounded-full bg-white flex items-center justify-center text-[28px] press transition-all ${
                    emoji === o ? 'border-[3px] border-primary shadow-sticker' : 'border-2 border-on-surface shadow-sticker-sm opacity-70'
                  }`}
                >
                  <span className={`mood-glyph ${emoji === o ? MOOD_ANIM[o] : ''}`}>{o}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 想再来：爱心切换 */}
          <Row label="还想再来吗">
            <button
              onClick={() => setWantAgain((a) => !a)}
              className={`px-4 py-1.5 rounded-full border-2 border-on-surface text-sm font-bold shadow-sticker-sm press-sm ${
                wantAgain ? 'bg-primary text-white' : 'bg-white text-on-surface-variant'
              }`}
            >
              {wantAgain ? '❤️ 还想来' : '🤍 还想来'}
            </button>
          </Row>

          {/* 时间 */}
          <Row label="📅 哪天 · 哪顿">
            <DateTimeWheel value={date} onChange={setDate} meal={meal} onMealChange={setMeal} />
          </Row>

          {/* 花费 + 人均 */}
          <Row label="💰 这顿花了多少">
            <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="总价 ¥" className={input} />
            {!!amount && Number(people) > 0 && (
              <div className="text-sm font-bold mt-1.5">
                人均 <b className="text-primary text-base">¥{perPerson || '—'}</b> · {people}人
              </div>
            )}
          </Row>

          {/* 人数：滚轮 */}
          <Row label="👥 几个人">
            <NumberWheel value={Number(people) || 1} onChange={(v) => setPeople(String(v))} min={1} max={20} unit="人" />
          </Row>

          {/* 和谁 */}
          <Row label="和谁一起">
            <input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="比如：饼饼 / 同事 / 一个人" className={input} />
          </Row>

          {/* 点评 */}
          <Row label="💬 加点评">
            <textarea value={feeling} onChange={(e) => setFeeling(e.target.value)} rows={2} placeholder="好吃在哪？想说点啥…" className={`${input} resize-none`} />
          </Row>

          {/* 照片 */}
          <Row label="📷 照片（最多 4 张）">
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

      {err && <div className="text-primary font-bold text-sm bg-primary/10 border-2 border-primary/25 rounded-lg px-3 py-2 mt-3">{err}</div>}

      {!confirmDel ? (
        <div className="flex gap-2 mt-5">
          <button
            onClick={() => setConfirmDel(true)}
            className="px-4 py-3 rounded-full border-2 border-on-surface bg-white text-primary font-bold press-sm"
          >
            删除
          </button>
          <StickerButton full disabled={busy} onClick={save}>
            {busy ? '保存中…' : '保存'}
          </StickerButton>
        </div>
      ) : (
        <div className="mt-5 text-center">
          <p className="text-sm font-bold text-on-surface-variant mb-2">确认删除？删了找不回来</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDel(false)} className="flex-1 px-4 py-3 rounded-full border-2 border-on-surface bg-white font-bold press-sm">
              取消
            </button>
            <button
              onClick={remove}
              disabled={busy}
              className="flex-1 px-4 py-3 rounded-full border-2 border-on-surface bg-primary text-white font-bold press-sm"
            >
              {busy ? '删除中…' : '确认删除'}
            </button>
          </div>
        </div>
      )}
    </SheetShell>
  )
}

function Row({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-bold text-on-surface-variant mb-1">{label}</label>
      {children}
    </div>
  )
}
