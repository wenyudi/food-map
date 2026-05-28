import { useEffect, useState } from 'react'
import { parseText, search, upsertStore, addVisit, addWish } from '../api'
import type { ParsedSentence } from '../api'
import { getMyLocation } from '../lib/geo'
import type { MyLocation } from '../lib/geo'
import PhotoPicker from '../components/PhotoPicker'

const EMOJI_OPTIONS: Array<{ emoji: '😋' | '🤤' | '😂' | '😐', label: string }> = [
  { emoji: '😋', label: '太好吃' },
  { emoji: '🤤', label: '好吃' },
  { emoji: '😂', label: '一般' },
  { emoji: '😐', label: '不咋地' },
]

interface Props { onSubmitted: () => void }

export default function AddView({ onSubmitted }: Props) {
  const [step, setStep] = useState<'input' | 'pick' | 'confirm'>('input')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [parsed, setParsed] = useState<ParsedSentence | null>(null)
  const [pois, setPois] = useState<any[]>([])
  const [selectedPoi, setSelectedPoi] = useState<any>(null)
  const [city, setCity] = useState('重庆')

  const [myLocation, setMyLocation] = useState<MyLocation | null>(null)
  const [photos, setPhotos] = useState<string[]>([])

  // 确认阶段的表单状态
  const [amount, setAmount] = useState('')
  const [people, setPeople] = useState('2')
  const [emoji, setEmoji] = useState<'😋' | '🤤' | '😂' | '😐'>('🤤')
  const [wantAgain, setWantAgain] = useState(true)
  const [feeling, setFeeling] = useState('')
  const [companions, setCompanions] = useState('饼饼')
  const [source, setSource] = useState('小红书')
  const [reason, setReason] = useState('')

  // 进入页面就异步拿定位（不阻塞 UI；失败/拒绝就没事，fallback 到城市搜）
  useEffect(() => {
    getMyLocation().then(loc => {
      if (loc) {
        setMyLocation(loc)
        console.log('[geo] 当前位置', loc)
      }
    })
  }, [])

  async function handleParse() {
    if (!text.trim()) return
    setBusy(true)
    try {
      const p = await parseText(text)
      setParsed(p)
      const locStr = myLocation ? `${myLocation.lng},${myLocation.lat}` : undefined
      const ps = await search(p.store_hint, city, locStr)
      setPois(ps)
      if (ps.length > 0) setSelectedPoi(ps[0])

      // 用 AI 结果预填表单
      setAmount(p.amount?.toString() || '')
      setPeople(p.people_count?.toString() || '2')
      if (p.mood_emoji) setEmoji(p.mood_emoji)
      if (p.want_again !== null) setWantAgain(p.want_again)
      setFeeling(p.feeling || '')
      setCompanions(p.companions || '饼饼')
      setSource(p.source || '小红书')
      setReason(p.reason || '')

      setStep('pick')
    } catch (e: any) {
      alert('解析失败：' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit() {
    if (!selectedPoi || !parsed) return
    setBusy(true)
    try {
      const store = await upsertStore(selectedPoi)
      if (parsed.intent === 'wish') {
        await addWish({
          poi_id: store.poi_id,
          store_hint: store.name,
          source: source || '小红书',
          reason: reason || '',
        })
      } else {
        await addVisit({
          poi_id: store.poi_id,
          date: parsed.date || new Date().toISOString().slice(0, 10),
          meal_period: parsed.meal_period || guessMealPeriod(),
          amount: Number(amount) || 0,
          people_count: Number(people) || 1,
          mood_emoji: emoji,
          want_again: wantAgain,
          feeling, companions,
          my_photos: photos.join('|'),
        })
      }
      reset()
      onSubmitted()
    } catch (e: any) {
      alert('提交失败：' + (e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep('input')
    setText('')
    setParsed(null)
    setPois([])
    setSelectedPoi(null)
    setPhotos([])
  }

  if (step === 'input') {
    return (
      <div className="page add-input">
        <h2>一句话记一笔</h2>
        <p className="hint">
          支持自动识别 "吃过" 和 "种草"。
          {myLocation && <span className="geo-tip"> · 📍 已定位，优先搜附近</span>}
        </p>
        <div className="examples">
          <button onClick={() => setText('昨晚和饼饼去格特士吃了200，菜偏甜')}>昨晚和饼饼去格特士吃了200，菜偏甜</button>
          <button onClick={() => setText('小红书种草鼎泰丰，听说小笼包绝了')}>小红书种草鼎泰丰，听说小笼包绝了</button>
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="按住麦克风用语音输入也行 →"
          rows={4}
        />
        <div className="row">
          <label>城市</label>
          <input value={city} onChange={e => setCity(e.target.value)} />
        </div>
        <button className="primary" disabled={busy || !text.trim()} onClick={handleParse}>
          {busy ? 'AI 解析中…' : '🤖 让 AI 解析'}
        </button>
      </div>
    )
  }

  if (step === 'pick') {
    return (
      <div className="page add-pick">
        <div className="parsed-summary">
          <div>🤖 识别为 {parsed?.intent === 'visit' ? '已吃过' : '种草想去'}</div>
          <div className="hint">
            店名：{parsed?.store_hint}
            {myLocation && ' · 已按距离排序'}
          </div>
        </div>

        <h3>挑一家高德 POI</h3>
        {pois.length === 0 && <div className="empty">没搜到结果，换关键词试试 <button onClick={reset}>返回</button></div>}
        {pois.map((p, i) => (
          <div
            key={p.id}
            className={'poi-card' + (selectedPoi?.id === p.id ? ' selected' : '')}
            onClick={() => setSelectedPoi(p)}
          >
            <div className="poi-name">{i + 1}. {p.name}</div>
            <div className="poi-meta">
              {p.business?.tag && <span>{p.business.tag}</span>}
              {p.business?.rating && <span>⭐ {p.business.rating}</span>}
              {p.business?.cost && <span>¥{p.business.cost}/人</span>}
              {p.distance && <span>{Math.round(Number(p.distance))}m</span>}
            </div>
            <div className="poi-addr">{p.pname}{p.cityname}{p.adname} · {p.address}</div>
          </div>
        ))}
        <div className="row">
          <button onClick={reset}>返回</button>
          <button className="primary" disabled={!selectedPoi} onClick={() => setStep('confirm')}>下一步 →</button>
        </div>
      </div>
    )
  }

  // confirm
  return (
    <div className="page add-confirm">
      <div className="parsed-summary">
        <div>🏠 <b>{selectedPoi?.name}</b></div>
      </div>

      {parsed?.intent === 'visit' ? (
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
            <input value={feeling} onChange={e => setFeeling(e.target.value)} placeholder="一句话" />
          </div>
          <div className="form-row">
            <label>评分</label>
            <div className="emoji-picker">
              {EMOJI_OPTIONS.map(o => (
                <button
                  key={o.emoji}
                  className={emoji === o.emoji ? 'selected' : ''}
                  onClick={() => setEmoji(o.emoji)}
                >
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
            <input value={companions} onChange={e => setCompanions(e.target.value)} />
          </div>

          <div className="form-block">
            <label>📷 拍 3 张</label>
            <PhotoPicker photos={photos} onChange={setPhotos} max={5} />
          </div>
        </>
      ) : (
        <>
          <div className="form-row">
            <label>来源</label>
            <input value={source} onChange={e => setSource(e.target.value)} />
          </div>
          <div className="form-row">
            <label>理由</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="一句话" />
          </div>
        </>
      )}

      <div className="row">
        <button onClick={() => setStep('pick')}>← 改店</button>
        <button className="primary" disabled={busy} onClick={handleSubmit}>
          {busy ? '提交中…' : '✓ 提交'}
        </button>
      </div>
    </div>
  )
}

function guessMealPeriod() {
  const h = new Date().getHours()
  if (h < 10) return '早'
  if (h < 16) return '中'
  return '晚'
}
