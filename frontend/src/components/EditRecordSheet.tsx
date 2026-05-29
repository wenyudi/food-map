import { useState } from 'react'
import { updateVisit, deleteVisit, updateWish, deleteWish } from '../api'
import PhotoPicker from './PhotoPicker'

type Mood = '😋' | '🤤' | '😂' | '😐' | '🤮'
const EMOJI_OPTIONS: Array<{ emoji: Mood, label: string }> = [
  { emoji: '😋', label: '太好吃' },
  { emoji: '🤤', label: '好吃' },
  { emoji: '😂', label: '一般' },
  { emoji: '😐', label: '不咋地' },
  { emoji: '🤮', label: '踩雷' },
]

interface Props {
  kind: 'visit' | 'wish'
  data: any            // Visit 或 Wish
  storeName: string
  onClose: () => void
  onChanged: () => void  // 改完/删完后让列表重新拉
}

export default function EditRecordSheet({ kind, data, storeName, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  // visit 字段
  const [amount, setAmount] = useState(String(data.amount ?? ''))
  const [people, setPeople] = useState(String(data.people_count ?? '2'))
  const [emoji, setEmoji] = useState<Mood>(data.mood_emoji || '🤤')
  const [wantAgain, setWantAgain] = useState(!!data.want_again)
  const [feeling, setFeeling] = useState(data.feeling || '')
  const [companions, setCompanions] = useState(data.companions || '')
  const [photos, setPhotos] = useState<string[]>((data.my_photos || '').split('|').filter(Boolean))
  // wish 字段
  const [source, setSource] = useState(data.source || '')
  const [reason, setReason] = useState(data.reason || '')

  async function save() {
    setBusy(true); setErr(null)
    try {
      if (kind === 'visit') {
        await updateVisit(data.visit_id, {
          amount: Number(amount) || 0,
          people_count: Number(people) || 1,
          mood_emoji: emoji,
          want_again: wantAgain,
          feeling, companions,
          my_photos: photos.join('|'),
        })
      } else {
        await updateWish(data.wish_id, { source, reason })
      }
      onChanged(); onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '保存失败')
    } finally { setBusy(false) }
  }

  async function remove() {
    setBusy(true); setErr(null)
    try {
      if (kind === 'visit') await deleteVisit(data.visit_id)
      else await deleteWish(data.wish_id)
      onChanged(); onClose()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '删除失败')
    } finally { setBusy(false) }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">
          {kind === 'visit' ? '编辑这次记录' : '编辑想去'}
          <span className="sheet-store">{storeName}</span>
        </div>

        {kind === 'visit' ? (
          <>
            <div className="form-row">
              <label>金额 ¥</label>
              <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="form-row">
              <label>人数</label>
              <input type="number" inputMode="numeric" value={people} onChange={e => setPeople(e.target.value)} />
            </div>
            <div className="form-row">
              <label>感受</label>
              <input value={feeling} onChange={e => setFeeling(e.target.value)} placeholder="好吃在哪？一句话" />
            </div>
            <div className="form-row">
              <label>评分</label>
              <div className="emoji-picker">
                {EMOJI_OPTIONS.map(o => (
                  <button key={o.emoji} className={emoji === o.emoji ? 'selected' : ''} onClick={() => setEmoji(o.emoji)}>
                    {o.emoji}<span>{o.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label>想再来</label>
              <div className="toggle">
                <button className={wantAgain ? 'selected' : ''} onClick={() => setWantAgain(true)}>⭐ 想</button>
                <button className={!wantAgain ? 'selected' : ''} onClick={() => setWantAgain(false)}>不想</button>
              </div>
            </div>
            <div className="form-row">
              <label>和谁</label>
              <input value={companions} onChange={e => setCompanions(e.target.value)} placeholder="和谁一起？" />
            </div>
            <div className="form-block">
              <label>📷 照片</label>
              <PhotoPicker photos={photos} onChange={setPhotos} max={5} />
            </div>
          </>
        ) : (
          <>
            <div className="form-row">
              <label>来源</label>
              <input value={source} onChange={e => setSource(e.target.value)} placeholder="小红书 / 抖音 / 朋友推荐" />
            </div>
            <div className="form-row">
              <label>理由</label>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="为什么想去？一句话" />
            </div>
          </>
        )}

        {err && <div className="add-error">{err}</div>}

        {!confirmDel ? (
          <div className="sheet-actions">
            <button className="sheet-del" onClick={() => setConfirmDel(true)}>删除</button>
            <button className="primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存'}</button>
          </div>
        ) : (
          <div className="sheet-confirm">
            <span>确认删除？删了找不回来</span>
            <button className="sheet-cancel" onClick={() => setConfirmDel(false)}>取消</button>
            <button className="sheet-del" disabled={busy} onClick={remove}>{busy ? '删除中…' : '确认删除'}</button>
          </div>
        )}
      </div>
    </div>
  )
}
