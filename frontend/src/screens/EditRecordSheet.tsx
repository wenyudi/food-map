import { useState } from 'react'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'
import PhotoPicker from '../components/PhotoPicker'
import { updateVisit, deleteVisit, updateWish, deleteWish } from '../api'

type Mood = '😋' | '🤤' | '😂' | '😐' | '🤮'
const EMOJI_OPTIONS: Mood[] = ['😋', '🤤', '😂', '😐', '🤮']

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

  return (
    <SheetShell onClose={onClose}>
      <h3 className="font-headline text-xl mb-1">{kind === 'visit' ? '编辑这次记录' : '编辑想去'}</h3>
      <p className="text-sm text-on-surface-variant mb-4">{storeName}</p>

      {kind === 'visit' ? (
        <div className="space-y-3">
          <Row label="时间">
            <div className="flex gap-2">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
              <div className="flex rounded-xl border-2 border-on-surface overflow-hidden shrink-0 shadow-sticker-sm">
                {(['早', '中', '晚'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMeal(m)}
                    className={`px-3 py-2 font-bold ${meal === m ? 'bg-primary text-white' : 'bg-white'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </Row>
          <div className="flex gap-2">
            <Row label="金额 ¥" className="flex-1">
              <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
            </Row>
            <Row label="人数" className="flex-1">
              <input type="number" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} className={input} />
            </Row>
          </div>
          <Row label="评分">
            <div className="flex gap-2">
              {EMOJI_OPTIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => setEmoji(o)}
                  className={`flex-1 aspect-square rounded-full border-2 border-on-surface flex items-center justify-center text-xl ${
                    emoji === o ? 'bg-accent shadow-sticker-sm scale-105' : 'bg-white opacity-55'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </Row>
          <Row label="想再来">
            <div className="flex rounded-full border-2 border-on-surface overflow-hidden w-fit shadow-sticker-sm">
              <button onClick={() => setWantAgain(true)} className={`px-4 py-1.5 font-bold ${wantAgain ? 'bg-primary text-white' : 'bg-white'}`}>
                ⭐ 想
              </button>
              <button onClick={() => setWantAgain(false)} className={`px-4 py-1.5 font-bold ${!wantAgain ? 'bg-primary text-white' : 'bg-white'}`}>
                不想
              </button>
            </div>
          </Row>
          <Row label="感受">
            <input value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="好吃在哪？一句话" className={input} />
          </Row>
          <Row label="和谁">
            <input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="和谁一起？" className={input} />
          </Row>
          <Row label="📷 照片">
            <PhotoPicker photos={photos} onChange={setPhotos} max={5} />
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
