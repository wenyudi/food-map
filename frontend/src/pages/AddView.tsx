import { useEffect, useRef, useState } from 'react'
import { parseText, search, upsertStore, addVisit, addWish, regeo } from '../api'
import type { ParsedSentence } from '../api'
import { getMyLocation } from '../lib/geo'
import type { MyLocation } from '../lib/geo'
import { cleanTag, fmtDist } from '../lib/format'
import PhotoPicker from '../components/PhotoPicker'

type Mood = '😋' | '🤤' | '😂' | '😐' | '🤮'
const EMOJI_OPTIONS: Array<{ emoji: Mood, label: string }> = [
  { emoji: '😋', label: '太好吃' },
  { emoji: '🤤', label: '好吃' },
  { emoji: '😂', label: '一般' },
  { emoji: '😐', label: '不咋地' },
  { emoji: '🤮', label: '踩雷' },
]
// 每档心情对应的 CSS 动效类（只在"选中"时播放，让原生苹果表情动起来）
const MOOD_ANIM: Record<Mood, string> = {
  '😋': 'm-yum', '🤤': 'm-drool', '😂': 'm-laugh', '😐': 'm-meh', '🤮': 'm-vomit',
}

interface Props {
  onSubmitted: () => void
}

// 记住上次填的城市 / 同行人，下次自动带出（去个人化：不再硬编码「重庆」「饼饼」）
const LS_CITY = 'last_city'
const LS_COMPANIONS = 'last_companions'

// 示例句：一条「吃过」、一条「种草」，点一下直接套用
const EXAMPLES: Array<{ kind: 'eat' | 'wish'; text: string }> = [
  { kind: 'eat', text: '今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩' },
  { kind: 'wish', text: '小红书种草一家面包店，可颂据说一绝' },
]

export default function AddView({ onSubmitted }: Props) {
  const [step, setStep] = useState<'input' | 'pick' | 'confirm'>('input')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<string | null>(null)  // 兑现种草时显示店名
  const [parsed, setParsed] = useState<ParsedSentence | null>(null)
  const [intent, setIntent] = useState<'visit' | 'wish'>('visit')  // 确认页可改；手动录入靠它
  const [pois, setPois] = useState<any[]>([])
  const [selectedPoi, setSelectedPoi] = useState<any>(null)
  const [city, setCity] = useState(() => localStorage.getItem(LS_CITY) || '重庆')
  // 用户是否手动设过城市（设过/曾保存过就不再用定位覆盖）
  const cityTouched = useRef<boolean>(!!localStorage.getItem(LS_CITY))

  const [myLocation, setMyLocation] = useState<MyLocation | null>(null)
  const [photos, setPhotos] = useState<string[]>([])

  // 确认阶段的表单状态
  const [amount, setAmount] = useState('')
  const [people, setPeople] = useState('2')
  const [emoji, setEmoji] = useState<Mood>('🤤')
  const [wantAgain, setWantAgain] = useState(true)
  const [feeling, setFeeling] = useState('')
  const [companions, setCompanions] = useState(() => localStorage.getItem(LS_COMPANIONS) || '')
  const [source, setSource] = useState('小红书')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')              // 确认页可改的日期
  const [meal, setMeal] = useState<'早' | '中' | '晚'>('中')  // 早 / 中 / 晚

  // 进入页面就异步拿定位（不阻塞 UI；失败/拒绝就没事，fallback 到城市搜）
  useEffect(() => {
    getMyLocation().then(loc => {
      if (loc) {
        setMyLocation(loc)
        // 没手动设过城市 → 用定位反查城市，自动填一次（出差/外地朋友友好）
        if (!cityTouched.current) {
          regeo(`${loc.lng},${loc.lat}`)
            .then(r => { if (r.city && !cityTouched.current) setCity(r.city) })
            .catch(() => {})
        }
      }
    })
  }, [])

  async function handleParse() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const p = await parseText(text)
      setParsed(p)
      setIntent(p.intent)
      if (city.trim()) localStorage.setItem(LS_CITY, city.trim())
      const locStr = myLocation ? `${myLocation.lng},${myLocation.lat}` : undefined
      const ps = await search(p.store_hint, city, locStr)
      setPois(ps)
      if (ps.length > 0) setSelectedPoi(ps[0])

      // 用 AI 结果预填表单（同行人：AI 没识别就回退到上次填的）
      setAmount(p.amount?.toString() || '')
      setPeople(p.people_count?.toString() || '2')
      if (p.mood_emoji) setEmoji(p.mood_emoji)
      if (p.want_again !== null) setWantAgain(p.want_again)
      setFeeling(p.feeling || '')
      setCompanions(p.companions || localStorage.getItem(LS_COMPANIONS) || '')
      setSource(p.source || '小红书')
      setReason(p.reason || '')
      setDate(p.date || new Date().toISOString().slice(0, 10))
      setMeal((p.meal_period as '早' | '中' | '晚') || guessMealPeriod())

      setStep('pick')
    } catch (e: any) {
      setError('解析失败：' + (e?.response?.data?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  // 「自己填」：跳过 AI，直接拿输入框文字当店名去高德搜
  async function handleManual() {
    const kw = text.trim()
    if (!kw) { setError('先在上面输入框写下店名，再点这里直接搜'); return }
    setBusy(true)
    setError(null)
    try {
      if (city.trim()) localStorage.setItem(LS_CITY, city.trim())
      const locStr = myLocation ? `${myLocation.lng},${myLocation.lat}` : undefined
      const ps = await search(kw, city, locStr)
      setPois(ps)
      if (ps.length > 0) setSelectedPoi(ps[0])
      // 合成一个最简 parsed，剩下的字段确认页手动填
      setParsed({ intent: 'visit', store_hint: kw, date: null, meal_period: null,
        companions: null, amount: null, people_count: null, feeling: null,
        mood_emoji: null, want_again: null, source: null, reason: null })
      setIntent('visit')
      setAmount(''); setPeople('2'); setEmoji('🤤'); setWantAgain(true)
      setFeeling(''); setCompanions(localStorage.getItem(LS_COMPANIONS) || '')
      setSource('小红书'); setReason('')
      setDate(new Date().toISOString().slice(0, 10)); setMeal(guessMealPeriod())
      setStep('pick')
    } catch (e: any) {
      setError('搜索失败：' + (e?.response?.data?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  // 高德查无此店 → 用当前定位建一个「手动店」（poi_id 以 m_ 开头）
  function addManualStore() {
    const name = (parsed?.store_hint || text || '').trim() || '未命名小店'
    const loc = myLocation ? `${myLocation.lng},${myLocation.lat}` : ''
    setSelectedPoi({
      id: 'm_' + Math.random().toString(36).slice(2, 10),
      name,
      location: loc,
      business: {},
      pname: '', cityname: city, adname: '',
      address: loc ? '手动添加 · 当前位置' : '手动添加 · 未定位',
    })
    setStep('confirm')
  }

  async function handleSubmit() {
    if (!selectedPoi || !parsed) return
    setBusy(true)
    setError(null)
    try {
      const store = await upsertStore(selectedPoi)
      if (intent === 'wish') {
        await addWish({
          poi_id: store.poi_id,
          store_hint: store.name,
          source: source || '小红书',
          reason: reason || '',
        })
      } else {
        const res = await addVisit({
          poi_id: store.poi_id,
          date: date || new Date().toISOString().slice(0, 10),
          meal_period: meal,
          amount: Number(amount) || 0,
          people_count: Number(people) || 1,
          mood_emoji: emoji,
          want_again: wantAgain,
          feeling, companions,
          my_photos: photos.join('|'),
        })
        // 记住这次的同行人，下次自动带出
        if (companions.trim()) localStorage.setItem(LS_COMPANIONS, companions.trim())
        // 这次"吃过"刚好兑现了之前的种草 → 庆祝一下再跳走
        if (res?.fulfilled_wish) {
          setCelebrate(store.name || '这家店')
          setTimeout(() => { setCelebrate(null); reset(); onSubmitted() }, 2000)
          return
        }
      }
      reset()
      onSubmitted()
    } catch (e: any) {
      setError('提交失败：' + (e?.response?.data?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setStep('input')
    setText('')
    setError(null)
    setParsed(null)
    setIntent('visit')
    setPois([])
    setSelectedPoi(null)
    setPhotos([])
  }

  if (step === 'input') {
    return (
      <div className="page add-input">
        <h2>一句话记一笔</h2>
        <p className="hint">
          把刚吃的、或想去的店随口说一句，AI 自动认出店名、金额和心情。
          {myLocation && <span className="geo-tip"> · 📍 已定位，优先搜附近</span>}
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="例如：今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩"
          rows={4}
        />
        <div className="ex-hint">不知道怎么写？点一条直接套用 👇</div>
        <div className="examples">
          {EXAMPLES.map((ex, i) => (
            <button key={i} className="ex-chip" onClick={() => setText(ex.text)}>
              <span className={'ex-tag ' + ex.kind}>{ex.kind === 'eat' ? '吃过' : '种草'}</span>
              <span className="ex-text">{ex.text}</span>
            </button>
          ))}
        </div>
        <div className="row">
          <label>城市</label>
          <input
            value={city}
            onChange={e => { cityTouched.current = true; setCity(e.target.value) }}
            placeholder="如：重庆"
          />
        </div>
        {error && <div className="add-error">{error}</div>}
        <button className="primary" disabled={busy || !text.trim()} onClick={handleParse}>
          {busy ? '解析中…' : '✨ 让 AI 解析'}
        </button>
        <button className="ghost-btn" disabled={busy} onClick={handleManual}>
          ✍️ 知道吃哪家？直接搜店名自己填
        </button>
      </div>
    )
  }

  if (step === 'pick') {
    const isVisit = parsed?.intent === 'visit'
    return (
      <div className="page add-pick">
        <div className="step-head">
          <button className="step-back" onClick={reset} aria-label="返回">←</button>
          <div className="step-head-text">
            <div className="step-title">是哪一家？</div>
            <div className="step-sub">
              <span className={'ex-tag ' + (isVisit ? 'eat' : 'wish')}>{isVisit ? '吃过' : '种草'}</span>
              <b>{parsed?.store_hint}</b>
              {myLocation && <span className="step-sub-dim">· 已按距离排序</span>}
            </div>
          </div>
        </div>

        {pois.length === 0 ? (
          <div className="empty">
            高德没搜到「{parsed?.store_hint}」<br />路边摊 / 家里做的店本来就查不到<br />
            <button className="primary manual-add-btn" onClick={addManualStore}>✍️ 自己加这家</button>
            <button className="link-btn" onClick={reset}>← 换个店名重搜</button>
          </div>
        ) : (
          <div className="poi-list">
            {pois.map((p) => {
              const sel = selectedPoi?.id === p.id
              const tag = cleanTag(p.business?.tag)
              return (
                <button
                  key={p.id}
                  className={'poi-card' + (sel ? ' selected' : '')}
                  onClick={() => setSelectedPoi(p)}
                >
                  <div className="poi-main">
                    <div className="poi-name">{p.name}</div>
                    <div className="poi-meta">
                      {tag && <span>{tag}</span>}
                      {p.business?.rating && <span>⭐ {p.business.rating}</span>}
                      {p.business?.cost && <span>¥{p.business.cost}/人</span>}
                      {p.distance && <span>📍 {fmtDist(p.distance)}</span>}
                    </div>
                    <div className="poi-addr">{p.adname} · {p.address}</div>
                  </div>
                  <span className="poi-check">{sel ? '✓' : ''}</span>
                </button>
              )
            })}
          </div>
        )}

        {pois.length > 0 && (
          <div className="step-actions">
            <button className="primary" disabled={!selectedPoi} onClick={() => setStep('confirm')}>
              就是这家 →
            </button>
            <button className="link-btn" onClick={addManualStore}>都不是？✍️ 自己加「{parsed?.store_hint}」</button>
          </div>
        )}
      </div>
    )
  }

  // confirm
  const isVisit = intent === 'visit'
  const isManual = !!(selectedPoi?.id && String(selectedPoi.id).startsWith('m_'))
  return (
    <div className="page add-confirm">
      {celebrate && (
        <div className="celebrate-overlay">
          <div className="celebrate-card">
            <div className="celebrate-emoji">✨</div>
            <div className="celebrate-title">种草兑现啦</div>
            <div className="celebrate-sub">惦记了一阵的 <b>{celebrate}</b><br />今天终于吃到了</div>
          </div>
        </div>
      )}
      <div className="step-head">
        <button className="step-back" onClick={() => setStep('pick')} aria-label="改店">←</button>
        <div className="step-head-text">
          <div className="step-title">{isVisit ? '记下这一顿' : '加进想去清单'}</div>
          {isManual ? (
            <input
              className="confirm-store-edit"
              value={selectedPoi?.name || ''}
              onChange={e => setSelectedPoi({ ...selectedPoi, name: e.target.value })}
              placeholder="店名"
            />
          ) : (
            <div className="step-sub"><span className="confirm-store">🍴 {selectedPoi?.name}</span></div>
          )}
        </div>
      </div>

      {isManual && (
        <div className="manual-note">
          ✍️ 手动添加 · {selectedPoi?.location ? '已用当前定位，会显示在地图上' : '未定位，先只进列表'}
        </div>
      )}

      <div className="intent-toggle">
        <button className={isVisit ? 'selected' : ''} onClick={() => setIntent('visit')}>🍴 吃过</button>
        <button className={!isVisit ? 'selected' : ''} onClick={() => setIntent('wish')}>🌱 种草</button>
      </div>

      {isVisit ? (
        <>
          <div className="form-row">
            <label>时间</label>
            <div className="datetime-row">
              <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              <div className="meal-toggle">
                {(['早', '中', '晚'] as const).map(m => (
                  <button key={m} className={meal === m ? 'selected' : ''} onClick={() => setMeal(m)}>{m}</button>
                ))}
              </div>
            </div>
          </div>
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
                <button
                  key={o.emoji}
                  className={emoji === o.emoji ? 'selected' : ''}
                  onClick={() => setEmoji(o.emoji)}
                >
                  <span className={'mood-glyph ' + MOOD_ANIM[o.emoji]}>{o.emoji}</span>
                  <span>{o.label}</span>
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

      {error && <div className="add-error">{error}</div>}
      <div className="step-actions">
        <button className="primary" disabled={busy} onClick={handleSubmit}>
          {busy ? '提交中…' : isVisit ? '✓ 存进地图' : '✓ 收藏想去'}
        </button>
      </div>
    </div>
  )
}

function guessMealPeriod(): '早' | '中' | '晚' {
  const h = new Date().getHours()
  if (h < 10) return '早'
  if (h < 16) return '中'
  return '晚'
}
