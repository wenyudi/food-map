import { useState } from 'react'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'
import DateTimeWheel from '../ui/WheelPicker'
import PhotoPicker from '../components/PhotoPicker'
import Stepper from '../ui/Stepper'
import MoodPicker from '../components/MoodPicker'
import { cleanTag, inputClass } from '../lib/format'
import { updateVisit, deleteVisit, updateWish, deleteWish, rebindVisit, rebindWish, search } from '../api'
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
  const [swapQ, setSwapQ] = useState(storeName)
  const [swapBusy, setSwapBusy] = useState(false)
  const [swapResults, setSwapResults] = useState<any[]>([])
  const [swapSearched, setSwapSearched] = useState(false)

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

  async function swapSearch() {
    setSwapBusy(true)
    setErr(null)
    try {
      setSwapResults(await search(swapQ.trim(), localStorage.getItem('last_city') || '重庆'))
      setSwapSearched(true)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '搜索失败')
    } finally {
      setSwapBusy(false)
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
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-headline text-xl leading-tight">{readonly ? (kind === 'visit' ? '查看记录' : '查看想去') : kind === 'visit' ? '编辑这次记录' : '编辑想去'}</h3>
          <p className="text-xs text-on-surface-variant">{storeName}</p>
        </div>
      </div>

      {/* 店选错了：重新搜一家，把这条记录搬过去（店名/地图位置都跟着新店走） */}
      {!readonly && (
        <div className="mb-3">
          {!swapOpen ? (
            <button onClick={() => setSwapOpen(true)} className="text-xs font-bold text-primary underline underline-offset-2 press-sm">
              🏪 店选错了？换一家
            </button>
          ) : (
            <div className="border-2 border-dashed border-on-surface/25 rounded-xl p-2.5">
              <div className="flex gap-2">
                <input
                  value={swapQ}
                  onChange={(e) => setSwapQ(e.target.value)}
                  placeholder="搜正确的店名"
                  className={input + ' flex-1 min-w-0'}
                />
                <button
                  disabled={swapBusy || !swapQ.trim()}
                  onClick={swapSearch}
                  className="shrink-0 px-4 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold shadow-sticker-sm press-sm disabled:opacity-50"
                >
                  {swapBusy ? '搜索中…' : '搜索'}
                </button>
              </div>
              {swapSearched && swapResults.length === 0 && (
                <p className="text-xs text-on-surface-variant text-center py-2">没搜到，换个关键词试试</p>
              )}
              {swapResults.length > 0 && (
                <div className="flex flex-col gap-1.5 mt-2 max-h-44 overflow-y-auto">
                  {swapResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => swapTo(p)}
                      disabled={busy}
                      className="text-left rounded-lg border-2 border-on-surface bg-white p-2 press-sm"
                    >
                      <div className="text-sm font-bold">{p.name}</div>
                      <div className="text-[11px] text-on-surface-variant truncate">
                        {[cleanTag(p.business?.tag), p.adname, p.address].filter(Boolean).join(' · ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-on-surface-variant mt-2">点一家，这条记录就搬过去（店名/地图位置跟着新店走）</p>
            </div>
          )}
        </div>
      )}

      {readonly && (
        <div className="text-xs text-on-surface-variant text-center mb-2 bg-surface border-2 border-dashed border-on-surface/20 rounded-lg py-1.5">
          👀 {recordedByName || '圈友'} 记的，你只能看
        </div>
      )}
      <div className={readonly ? 'pointer-events-none select-none' : ''}>
      {kind === 'visit' ? (
        <div className="space-y-1.5">
          {/* 心情：5 个表情圈 */}
          <MoodPicker value={emoji} onChange={setEmoji} readonly={readonly} />

          {/* 还想来：从顶栏移下来，避免和抽屉关闭 ✕ 打架 */}
          <div className="flex justify-end">
            <button
              onClick={() => setWantAgain((a) => !a)}
              className={`px-3 py-1 rounded-full border-2 border-on-surface text-xs font-bold shadow-sticker-sm press-sm ${
                wantAgain ? 'bg-primary text-white' : 'bg-white text-on-surface-variant'
              }`}
            >
              {wantAgain ? '❤️ 还想来' : '🤍 还想来'}
            </button>
          </div>

          {/* 时间滚轮 */}
          <Row label="📅 哪天 · 哪顿">
            <DateTimeWheel value={date} onChange={setDate} meal={meal} onMealChange={setMeal} />
          </Row>

          {/* 花费/人数 · 点评/和谁：两行两列网格 → 左列(花费=点评)同宽、右列(人数=和谁)同宽 */}
          <div className="grid grid-cols-[1fr_116px] gap-x-2 gap-y-1.5 items-end">
            <Row label="💰 花费">
              <div className="relative">
                <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="总价 ¥" className={`${input} pr-[86px]`} />
                {!!amount && Number(people) > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-on-surface-variant pointer-events-none">
                    人均 <b className="text-primary">¥{perPerson || '—'}</b>
                  </span>
                )}
              </div>
            </Row>
            <Row label="👥 人数">
              <Stepper value={Number(people) || 1} onChange={(v) => setPeople(String(v))} max={30} full />
            </Row>
            <Row label="💬 点评">
              <input value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="好吃在哪" className={input} />
            </Row>
            <Row label="和谁">
              <input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="和谁一起" className={input} />
            </Row>
          </div>

          {/* 照片 */}
          <Row label="📷 照片">
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

      {err && <div className="text-primary font-bold text-sm bg-primary/10 border-2 border-primary/25 rounded-lg px-3 py-2 mt-3">{err}</div>}

      {readonly ? (
        <div className="mt-3">
          <button onClick={onClose} className="w-full py-2.5 rounded-full border-2 border-on-surface bg-white font-bold press-sm">关闭</button>
        </div>
      ) : !confirmDel ? (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setConfirmDel(true)}
            className="shrink-0 px-5 py-2 rounded-full border-2 border-on-surface bg-white text-primary font-bold press-sm"
          >
            删除
          </button>
          <StickerButton disabled={busy} onClick={save} className="flex-1 !py-2">
            {busy ? '保存中…' : '保存'}
          </StickerButton>
        </div>
      ) : (
        <div className="mt-3 text-center">
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
