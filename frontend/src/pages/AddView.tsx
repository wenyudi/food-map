import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parseText, search, upsertStore, addVisit, addWish, regeo, getStats, getPoints } from '../api'
import type { ParsedSentence, Stats, Point } from '../api'
import { getMyLocation, haversine } from '../lib/geo'
import type { MyLocation } from '../lib/geo'
import { cleanTag, fmtDist } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'
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

// 示例句：点一下直接套用，一条「吃过·想再来」、一条「种草」
const EXAMPLES: Array<{ kind: 'eat' | 'wish'; text: string }> = [
  { kind: 'eat', text: '中午和同事去 XX 烤鱼，人均 45，香辣过瘾还想再来' },
  { kind: 'wish', text: '小红书种草 XX 面包店，可颂据说一绝' },
]

// 高光时刻的内容（撒花浮层用）
type Celebration = { emoji: string; title: string; sub: ReactNode }

// 撒花：一把彩色纸屑从顶部飘落（纯 CSS + 随机参数，无依赖）
function Confetti() {
  const pieces = useMemo(() => {
    const colors = ['#ff5e62', '#ffa726', '#84b56a', '#ffd166', '#ef6c4f', '#f9c8c0', '#7bd389']
    return Array.from({ length: 40 }, (_, i) => ({
      left: Math.random() * 100,
      bg: colors[i % colors.length],
      delay: Math.random() * 0.5,
      dur: 1.6 + Math.random() * 1.3,
      drift: (Math.random() * 2 - 1) * 50,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
    }))
  }, [])
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} style={{
          left: `${p.left}%`,
          background: p.bg,
          width: p.w, height: p.h,
          ['--drift' as any]: `${p.drift}px`,
          animationDelay: `${p.delay}s`,
          animationDuration: `${p.dur}s`,
        }} />
      ))}
    </div>
  )
}

// 记一笔头部卡：按时段问候 + 录入进度（带数字滚动）
function RecordHero() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => { getStats().then(setStats).catch(() => {}) }, [])
  const meals = Math.round(useCountUp(stats?.total_visits ?? 0))
  const stores = Math.round(useCountUp(stats?.total_stores_visited ?? 0))

  const h = new Date().getHours()
  const [emoji, greet, prompt] =
    h < 5  ? ['🌙', '夜深了', '宵夜也值得记一笔'] :
    h < 11 ? ['🌅', '早上好', '早上吃了点啥？'] :
    h < 14 ? ['☀️', '中午好', '午饭整了顿啥？'] :
    h < 18 ? ['🌤️', '下午好', '下午茶 / 加餐也算一笔'] :
             ['🌙', '晚上好', '今晚吃了点啥？']

  return (
    <div className="add-hero">
      <div className="add-hero-greet">{emoji} {greet}</div>
      <div className="add-hero-prompt">{prompt}</div>
      {stats && (stats.total_visits > 0
        ? <div className="add-hero-stat">地图上已记下 <b>{meals}</b> 顿 · <b>{stores}</b> 家店 🥢</div>
        : <div className="add-hero-stat">记下第一顿，点亮你们的美食地图 ✨</div>
      )}
    </div>
  )
}

export default function AddView({ onSubmitted }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<Celebration | null>(null)  // 高光时刻：兑现 / 里程碑
  const [parsed, setParsed] = useState<ParsedSentence | null>(null)     // null=输入态，非空=解析后标签态
  const [intent, setIntent] = useState<'visit' | 'wish'>('visit')
  const [pois, setPois] = useState<any[]>([])
  const [selectedPoi, setSelectedPoi] = useState<any>(null)
  const [city, setCity] = useState(() => localStorage.getItem(LS_CITY) || '重庆')
  // 用户是否手动设过城市（设过/曾保存过就不再用定位覆盖）
  const cityTouched = useRef<boolean>(!!localStorage.getItem(LS_CITY))

  const [myLocation, setMyLocation] = useState<MyLocation | null>(null)
  const [nearby, setNearby] = useState<Point | null>(null)   // 你正站在某家已知店附近
  const [photos, setPhotos] = useState<string[]>([])

  // 解析后可改的字段
  const [amount, setAmount] = useState('')
  const [people, setPeople] = useState('2')
  const [emoji, setEmoji] = useState<Mood>('🤤')
  const [wantAgain, setWantAgain] = useState(true)
  const [feeling, setFeeling] = useState('')
  const [companions, setCompanions] = useState(() => localStorage.getItem(LS_COMPANIONS) || '')
  const [source, setSource] = useState('小红书')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState('')
  const [meal, setMeal] = useState<'早' | '中' | '晚'>('中')

  // 弹层：选店 / 金额
  const [storeSheet, setStoreSheet] = useState(false)
  const [amountSheet, setAmountSheet] = useState(false)

  // 进入页面就异步拿定位（不阻塞 UI；失败/拒绝就没事，fallback 到城市搜）
  useEffect(() => {
    getMyLocation().then(loc => {
      if (!loc) return
      setMyLocation(loc)
      // 没手动设过城市 → 用定位反查城市，自动填一次（出差/外地朋友友好）
      if (!cityTouched.current) {
        regeo(`${loc.lng},${loc.lat}`)
          .then(r => { if (r.city && !cityTouched.current) setCity(r.city) })
          .catch(() => {})
      }
      // 位置魔法：你正站在某家"想去/去过"的店附近吗？取 250m 内最近的一家
      getPoints().then(pts => {
        let best: Point | null = null
        let bestD = 250
        for (const p of pts) {
          if (!p.lng || !p.lat) continue
          const d = haversine(loc.lng, loc.lat, p.lng, p.lat)
          if (d < bestD) { bestD = d; best = p }
        }
        setNearby(best)
      }).catch(() => {})
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
      setSelectedPoi(ps.length > 0 ? ps[0] : null)

      // 用 AI 结果预填字段（同行人：AI 没识别就回退到上次填的）
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
    } catch (e: any) {
      setError('解析失败：' + (e?.response?.data?.detail || e?.message || e))
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
    setStoreSheet(false)
  }

  // 位置魔法：一键记下"就在附近"的已知店——直接进解析态（店已在库，确认即写）
  function recordNearby(p: Point) {
    setSelectedPoi({
      id: p.poi_id,
      name: p.name,
      location: `${p.lng},${p.lat}`,
      business: { tag: p.tag, rating: p.rating, cost: p.cost, business_area: p.business_area },
      pname: '', cityname: city, adname: p.business_area || '',
      address: p.address || '',
    })
    setParsed({ intent: 'visit', store_hint: p.name, date: null, meal_period: null,
      companions: null, amount: null, people_count: null, feeling: null,
      mood_emoji: null, want_again: null, source: null, reason: null })
    setPois([])
    setIntent('visit')
    setAmount(''); setPeople('2'); setEmoji('🤤'); setWantAgain(true)
    setFeeling(''); setCompanions(localStorage.getItem(LS_COMPANIONS) || '')
    setDate(new Date().toISOString().slice(0, 10)); setMeal(guessMealPeriod())
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
          cuisine: parsed?.cuisine || '',
          flavors: parsed?.flavors || [],
          dishes: parsed?.dishes || [],
          occasion: parsed?.occasion || '',
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
          // AI 隐形维度（解析出来就透传，没有就空）
          cuisine: parsed?.cuisine || '',
          flavors: parsed?.flavors || [],
          dishes: parsed?.dishes || [],
          occasion: parsed?.occasion || '',
        })
        // 记住这次的同行人，下次自动带出
        if (companions.trim()) localStorage.setItem(LS_COMPANIONS, companions.trim())
        // 高光时刻：种草兑现 > 里程碑 → 撒花 2.2s 再跳走
        let cel: Celebration | null = null
        if (res?.fulfilled_wish) {
          cel = { emoji: '✨', title: '种草兑现啦', sub: <>惦记了一阵的 <b>{store.name || '这家店'}</b><br />今天终于吃到了</> }
        } else if (res?.milestone) {
          cel = { emoji: res.milestone.emoji, title: res.milestone.title, sub: res.milestone.sub }
        }
        if (cel) {
          setCelebrate(cel)
          setTimeout(() => { setCelebrate(null); reset(); onSubmitted() }, 2200)
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
    setText('')
    setError(null)
    setParsed(null)
    setIntent('visit')
    setPois([])
    setSelectedPoi(null)
    setPhotos([])
    setStoreSheet(false)
    setAmountSheet(false)
  }

  const isVisit = intent === 'visit'
  const isManual = !!(selectedPoi?.id && String(selectedPoi.id).startsWith('m_'))
  const perPerson = (() => {
    const a = Number(amount), n = Number(people)
    return a > 0 && n > 0 ? Math.round((a / n) * 10) / 10 : 0
  })()
  const mealIcon = meal === '早' ? '🌅' : meal === '中' ? '☀️' : '🌙'
  function cycleMeal() { setMeal(m => (m === '早' ? '中' : m === '中' ? '晚' : '早')) }

  return (
    <div className="page add-input">
      {celebrate && (
        <div className="celebrate-overlay">
          <Confetti />
          <div className="celebrate-card">
            <div className="celebrate-emoji">{celebrate.emoji}</div>
            <div className="celebrate-title">{celebrate.title}</div>
            <div className="celebrate-sub">{celebrate.sub}</div>
          </div>
        </div>
      )}

      {!parsed && <RecordHero />}

      {!parsed && nearby && (
        <button className="nearby-card" onClick={() => recordNearby(nearby)}>
          <div className="nearby-ico">{nearby.visit_count > 0 ? '📍' : '💘'}</div>
          <div className="nearby-text">
            <div className="nearby-title">就在「{nearby.name}」附近</div>
            <div className="nearby-sub">
              {nearby.visit_count > 0 ? '又来啦？一键再记一笔' : '你想去的店就在眼前 · 点一下直接打卡'}
            </div>
          </div>
          <div className="nearby-go">记这家 →</div>
        </button>
      )}

      {/* 一句话输入框 · 永远在最上面 */}
      <div className="say-box">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="例如：今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩"
          rows={parsed ? 2 : 4}
        />
        <div className="say-foot">
          {!parsed && (
            <div className="say-city">
              <span>城市</span>
              <input value={city} onChange={e => { cityTouched.current = true; setCity(e.target.value) }} placeholder="重庆" />
            </div>
          )}
          <button className="say-parse" disabled={busy || !text.trim()} onClick={handleParse}>
            {busy ? '解析中…' : parsed ? '↻ 重新解析' : '✨ 解析'}
          </button>
        </div>
      </div>

      {!parsed && (
        <>
          <div className="ex-hint">不知道怎么写？点一条直接套用 👇</div>
          <div className="examples">
            {EXAMPLES.map((ex, i) => (
              <button key={i} className="ex-chip" onClick={() => setText(ex.text)}>
                <span className={'ex-tag ' + ex.kind}>{ex.kind === 'eat' ? '吃过' : '种草'}</span>
                <span className="ex-text">{ex.text}</span>
              </button>
            ))}
          </div>
          {myLocation && <p className="geo-tip">📍 已定位，优先搜附近</p>}
        </>
      )}

      {parsed && (
        <div className="parsed">
          <div className="parsed-head">AI 认出了这些 👇 点一下可改</div>
          <div className="p-tags">
            <button className="p-tag accent" onClick={() => setIntent(isVisit ? 'wish' : 'visit')}>
              {isVisit ? '🍴 吃过' : '🌱 想去'}
            </button>
            <button className="p-tag store" onClick={() => setStoreSheet(true)}>
              🏪 {selectedPoi?.name || '选店 / 手动加'}<span className="p-more">换</span>
            </button>
            {isVisit && (
              <>
                <label className="p-tag">
                  📅 {(date || '').slice(5).replace('-', '/')}
                  <input type="date" className="p-hidden-date" value={date} onChange={e => setDate(e.target.value)} />
                </label>
                <button className="p-tag" onClick={cycleMeal}>{mealIcon} {meal}</button>
                <button className="p-tag" onClick={() => setAmountSheet(true)}>
                  💰 {amount ? `人均¥${perPerson} · ${people}人` : '填金额'}
                </button>
              </>
            )}
            {parsed.cuisine && <span className="p-tag static">{parsed.cuisine}</span>}
            {(parsed.flavors || []).map(f => <span key={f} className="p-tag static">🌶️ {f}</span>)}
          </div>

          {isManual && (
            <div className="form-row">
              <label>店名</label>
              <input value={selectedPoi?.name || ''} onChange={e => setSelectedPoi({ ...selectedPoi, name: e.target.value })} placeholder="店名" />
            </div>
          )}

          {isVisit ? (
            <>
              <div className="form-row">
                <label>评分</label>
                <div className="emoji-picker">
                  {EMOJI_OPTIONS.map(o => (
                    <button key={o.emoji} className={emoji === o.emoji ? 'selected' : ''} onClick={() => setEmoji(o.emoji)}>
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
                <label>感受</label>
                <input value={feeling} onChange={e => setFeeling(e.target.value)} placeholder="好吃在哪？一句话" />
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
        </div>
      )}

      {error && <div className="add-error">{error}</div>}

      {parsed && (
        <div className="confirm-footer">
          <button className="primary" disabled={busy || !selectedPoi} onClick={handleSubmit}>
            {busy ? '提交中…' : isVisit ? '✓ 记下这一顿' : '✓ 收藏想去'}
          </button>
        </div>
      )}

      {/* 选店 sheet：高德候选 + 手动加 */}
      {storeSheet && (
        <div className="sheet-backdrop" onClick={() => setStoreSheet(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">🏪 选哪一家</div>
            {pois.length === 0 ? (
              <div className="empty">高德没搜到「{parsed?.store_hint}」<br />路边摊 / 家里做的本来就查不到</div>
            ) : (
              <div className="poi-list">
                {pois.map(p => {
                  const sel = selectedPoi?.id === p.id
                  const tag = cleanTag(p.business?.tag)
                  return (
                    <button
                      key={p.id}
                      className={'poi-card' + (sel ? ' selected' : '')}
                      onClick={() => { setSelectedPoi(p); setStoreSheet(false) }}
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
            <button className="link-btn" onClick={addManualStore}>都不是？✍️ 自己加「{parsed?.store_hint}」</button>
          </div>
        </div>
      )}

      {/* 金额 popup：人数 + 总价 → 自动算人均 */}
      {amountSheet && (
        <div className="sheet-backdrop" onClick={() => setAmountSheet(false)}>
          <div className="sheet amount-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-title">💰 这顿花了多少</div>
            <div className="amount-fields">
              <div className="form-cell">
                <label>总价 ¥</label>
                <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
              </div>
              <div className="form-cell">
                <label>几个人</label>
                <input type="number" inputMode="numeric" value={people} onChange={e => setPeople(e.target.value)} />
              </div>
            </div>
            <div className="amount-pp">人均 <b>¥{perPerson || '—'}</b></div>
            <button className="primary" onClick={() => setAmountSheet(false)}>好了</button>
          </div>
        </div>
      )}
    </div>
  )
}

function guessMealPeriod(): '早' | '中' | '晚' {
  const h = new Date().getHours()
  if (h < 10) return '早'
  if (h < 16) return '中'
  return '晚'
}
