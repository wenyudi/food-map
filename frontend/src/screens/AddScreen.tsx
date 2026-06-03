import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import TopBar, { Avatar } from '../ui/TopBar'
import Icon from '../ui/Icon'
import StickerButton from '../ui/StickerButton'
import SheetShell from '../ui/SheetShell'
import PhotoPicker from '../components/PhotoPicker'
import { parseText, search, upsertStore, addVisit, addWish, regeo, getStats, getPoints } from '../api'
import type { ParsedSentence, Stats, Point } from '../api'
import { getMyLocation, haversine } from '../lib/geo'
import type { MyLocation } from '../lib/geo'
import { cleanTag, fmtDist } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'

type Mood = '😋' | '🤤' | '😂' | '😐' | '🤮'
const EMOJI_OPTIONS: Array<{ emoji: Mood; label: string }> = [
  { emoji: '😋', label: '太好吃' },
  { emoji: '🤤', label: '好吃' },
  { emoji: '😂', label: '一般' },
  { emoji: '😐', label: '不咋地' },
  { emoji: '🤮', label: '踩雷' },
]

const LS_CITY = 'last_city'
const LS_COMPANIONS = 'last_companions'

const EXAMPLES: Array<{ kind: 'eat' | 'wish'; text: string }> = [
  { kind: 'eat', text: '中午和同事去 XX 烤鱼，人均 45，香辣过瘾还想再来' },
  { kind: 'wish', text: '小红书种草 XX 面包店，可颂据说一绝' },
]

type Celebration = { emoji: string; title: string; sub: ReactNode }

type AddScreenProps = Readonly<{ onSubmitted: () => void }>

export default function AddScreen({ onSubmitted }: AddScreenProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<Celebration | null>(null)
  const [parsed, setParsed] = useState<ParsedSentence | null>(null)
  const [intent, setIntent] = useState<'visit' | 'wish'>('visit')
  const [pois, setPois] = useState<any[]>([])
  const [selectedPoi, setSelectedPoi] = useState<any>(null)
  const [city, setCity] = useState(() => localStorage.getItem(LS_CITY) || '重庆')
  const cityTouched = useRef<boolean>(!!localStorage.getItem(LS_CITY))
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null)
  const [nearby, setNearby] = useState<Point | null>(null)
  const [photos, setPhotos] = useState<string[]>([])

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

  const [storeSheet, setStoreSheet] = useState(false)
  const [amountSheet, setAmountSheet] = useState(false)

  useEffect(() => {
    getMyLocation().then((loc) => {
      if (!loc) return
      setMyLocation(loc)
      if (!cityTouched.current) {
        regeo(`${loc.lng},${loc.lat}`)
          .then((r) => {
            if (r.city && !cityTouched.current) setCity(r.city)
          })
          .catch(() => {})
      }
      getPoints()
        .then((pts) => {
          let best: Point | null = null
          let bestD = 250
          for (const p of pts) {
            if (!p.lng || !p.lat) continue
            const d = haversine(loc.lng, loc.lat, p.lng, p.lat)
            if (d < bestD) {
              bestD = d
              best = p
            }
          }
          setNearby(best)
        })
        .catch(() => {})
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

  function addManualStore() {
    const name = (parsed?.store_hint || text || '').trim() || '未命名小店'
    const loc = myLocation ? `${myLocation.lng},${myLocation.lat}` : ''
    setSelectedPoi({
      id: 'm_' + Math.random().toString(36).slice(2, 10),
      name,
      location: loc,
      business: {},
      pname: '',
      cityname: city,
      adname: '',
      address: loc ? '手动添加 · 当前位置' : '手动添加 · 未定位',
    })
    setStoreSheet(false)
  }

  function recordNearby(p: Point) {
    setSelectedPoi({
      id: p.poi_id,
      name: p.name,
      location: `${p.lng},${p.lat}`,
      business: { tag: p.tag, rating: p.rating, cost: p.cost, business_area: p.business_area },
      pname: '',
      cityname: city,
      adname: p.business_area || '',
      address: p.address || '',
    })
    setParsed({
      intent: 'visit',
      store_hint: p.name,
      date: null,
      meal_period: null,
      companions: null,
      amount: null,
      people_count: null,
      feeling: null,
      mood_emoji: null,
      want_again: null,
      source: null,
      reason: null,
    })
    setPois([])
    setIntent('visit')
    setAmount('')
    setPeople('2')
    setEmoji('🤤')
    setWantAgain(true)
    setFeeling('')
    setCompanions(localStorage.getItem(LS_COMPANIONS) || '')
    setDate(new Date().toISOString().slice(0, 10))
    setMeal(guessMealPeriod())
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
          feeling,
          companions,
          my_photos: photos.join('|'),
          cuisine: parsed?.cuisine || '',
          flavors: parsed?.flavors || [],
          dishes: parsed?.dishes || [],
          occasion: parsed?.occasion || '',
        })
        if (companions.trim()) localStorage.setItem(LS_COMPANIONS, companions.trim())
        let cel: Celebration | null = null
        if (res?.fulfilled_wish) {
          cel = {
            emoji: '✨',
            title: '种草兑现啦',
            sub: (
              <>
                惦记了一阵的 <b>{store.name || '这家店'}</b>
                <br />
                今天终于吃到了
              </>
            ),
          }
        } else if (res?.milestone) {
          cel = { emoji: res.milestone.emoji, title: res.milestone.title, sub: res.milestone.sub }
        }
        if (cel) {
          setCelebrate(cel)
          setTimeout(() => {
            setCelebrate(null)
            reset()
            onSubmitted()
          }, 2200)
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
  const perPerson = useMemo(() => {
    const a = Number(amount),
      n = Number(people)
    return a > 0 && n > 0 ? Math.round((a / n) * 10) / 10 : 0
  }, [amount, people])
  const mealIcon = meal === '早' ? '🌅' : meal === '中' ? '☀️' : '🌙'
  const cycleMeal = () => setMeal((m) => (m === '早' ? '中' : m === '中' ? '晚' : '早'))

  return (
    <div className="h-full flex flex-col">
      {celebrate && (
        <div className="fixed inset-0 z-[200] bg-on-surface/50 flex items-center justify-center">
          <Confetti />
          <div className="sticker rounded-2xl px-8 py-7 text-center animate-pop max-w-[300px]">
            <div className="text-5xl mb-2">{celebrate.emoji}</div>
            <div className="font-headline text-2xl mb-1">{celebrate.title}</div>
            <div className="text-sm text-on-surface-variant">{celebrate.sub}</div>
          </div>
        </div>
      )}

      <TopBar right={<Avatar emoji="😋" />} />

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4">
        <h2 className="font-headline text-3xl">记一笔</h2>
        <p className="text-on-surface-variant font-bold text-sm mb-3">一句话，记下这一顿</p>

        {!parsed && <RecordHero />}

        {!parsed && nearby && (
          <button
            onClick={() => recordNearby(nearby)}
            className="w-full text-left sticker p-3 mb-3 flex items-center gap-3 press"
          >
            <span className="text-2xl shrink-0">{nearby.visit_count > 0 ? '📍' : '💘'}</span>
            <div className="flex-1 min-w-0">
              <div className="font-bold">就在「{nearby.name}」附近</div>
              <div className="text-xs text-on-surface-variant">
                {nearby.visit_count > 0 ? '又来啦？一键再记一笔' : '你想去的店就在眼前 · 点一下直接打卡'}
              </div>
            </div>
            <span className="text-primary font-bold text-sm shrink-0">记这家 →</span>
          </button>
        )}

        {/* 对话框 */}
        <div className="sticker p-3 mb-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例如：今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩"
            rows={parsed ? 2 : 4}
            className="w-full bg-transparent outline-none resize-none font-body text-on-surface placeholder:text-on-surface-variant/55"
          />
          <div className="flex items-center justify-between gap-2 pt-1">
            {!parsed ? (
              <label className="flex items-center gap-1 text-xs font-bold text-on-surface-variant">
                城市
                <input
                  value={city}
                  onChange={(e) => {
                    cityTouched.current = true
                    setCity(e.target.value)
                  }}
                  placeholder="重庆"
                  className="w-16 bg-white border-2 border-on-surface rounded-full px-2 py-0.5 outline-none text-center"
                />
              </label>
            ) : (
              <span />
            )}
            <button
              disabled={busy || !text.trim()}
              onClick={handleParse}
              className="flex items-center gap-1 text-sm font-bold text-white bg-primary border-2 border-on-surface rounded-full px-4 py-1.5 shadow-sticker-sm press-sm disabled:opacity-50"
            >
              {busy ? '解析中…' : parsed ? '↻ 重新识别' : '✨ 解析'}
            </button>
          </div>
        </div>

        {!parsed && (
          <>
            <div className="text-xs font-bold text-on-surface-variant mb-2">不知道怎么写？点一条直接套用 👇</div>
            <div className="flex flex-col gap-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setText(ex.text)}
                  className="text-left bg-white rounded-xl border-2 border-on-surface shadow-sticker-sm p-2.5 press-sm flex items-start gap-2"
                >
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full border-2 border-on-surface text-xs font-bold ${
                      ex.kind === 'eat' ? 'bg-accent text-on-surface' : 'bg-tertiary text-on-surface'
                    }`}
                  >
                    {ex.kind === 'eat' ? '吃过' : '种草'}
                  </span>
                  <span className="text-sm text-on-surface-variant">{ex.text}</span>
                </button>
              ))}
            </div>
            {myLocation && <p className="text-xs text-on-surface-variant mt-2">📍 已定位，优先搜附近</p>}
          </>
        )}

        {parsed && (
          <div>
            <p className="flex items-center gap-1 text-sm font-bold text-primary mb-2">
              <Icon name="auto_awesome" className="text-accent" /> AI 认出了这些 👇 点一下可改
            </p>

            {/* AI 标签 */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setIntent(isVisit ? 'wish' : 'visit')}
                className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-accent text-on-surface text-sm font-bold shadow-sticker-sm press-sm"
              >
                {isVisit ? '🍴 吃过' : '🌱 想去'}
              </button>
              <button
                onClick={() => setStoreSheet(true)}
                className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold shadow-sticker-sm press-sm inline-flex items-center gap-1"
              >
                🏪 {selectedPoi?.name || '选店 / 手动加'} <span className="opacity-80 underline">换</span>
              </button>
              {isVisit && (
                <>
                  <label className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold shadow-sticker-sm relative">
                    📅 {(date || '').slice(5).replace('-', '/')}
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </label>
                  <button
                    onClick={cycleMeal}
                    className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold shadow-sticker-sm press-sm"
                  >
                    {mealIcon} {meal}
                  </button>
                  <button
                    onClick={() => setAmountSheet(true)}
                    className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold shadow-sticker-sm press-sm"
                  >
                    💰 {amount ? `人均¥${perPerson} · ${people}人` : '填金额'}
                  </button>
                </>
              )}
              {parsed.cuisine && (
                <span className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-white text-on-surface-variant text-sm font-bold">
                  {parsed.cuisine}
                </span>
              )}
              {(parsed.flavors || []).map((f) => (
                <span
                  key={f}
                  className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-white text-on-surface-variant text-sm font-bold"
                >
                  🌶️ {f}
                </span>
              ))}
            </div>

            {isManual && (
              <Field label="店名">
                <input
                  value={selectedPoi?.name || ''}
                  onChange={(e) => setSelectedPoi({ ...selectedPoi, name: e.target.value })}
                  placeholder="店名"
                  className={INPUT}
                />
              </Field>
            )}

            {isVisit ? (
              <div className="space-y-4">
                <div>
                  <p className="font-headline text-lg mb-2">这一顿，好吃吗？</p>
                  <div className="flex justify-between gap-1">
                    {EMOJI_OPTIONS.map((o) => (
                      <button
                        key={o.emoji}
                        onClick={() => setEmoji(o.emoji)}
                        className={`flex-1 aspect-square rounded-full border-2 border-on-surface flex items-center justify-center text-2xl press ${
                          emoji === o.emoji ? 'bg-accent shadow-sticker scale-105' : 'bg-white shadow-sticker-sm opacity-55'
                        }`}
                      >
                        {o.emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="sticker p-3 flex items-center justify-between">
                  <span className="font-bold">
                    下次还想来 <span className="text-primary">❤️</span>
                  </span>
                  <button
                    onClick={() => setWantAgain((a) => !a)}
                    className={`w-14 h-8 rounded-full border-2 border-on-surface flex items-center px-0.5 transition-all ${
                      wantAgain ? 'bg-primary justify-end' : 'bg-white justify-start'
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-white border-2 border-on-surface" />
                  </button>
                </div>

                <Field label="感受">
                  <input value={feeling} onChange={(e) => setFeeling(e.target.value)} placeholder="好吃在哪？一句话" className={INPUT} />
                </Field>
                <Field label="和谁">
                  <input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="和谁一起？" className={INPUT} />
                </Field>
                <Field label="📷 照片">
                  <PhotoPicker photos={photos} onChange={setPhotos} max={5} />
                </Field>
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="来源">
                  <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="小红书 / 抖音 / 朋友推荐" className={INPUT} />
                </Field>
                <Field label="理由">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="为什么想去？一句话" className={INPUT} />
                </Field>
              </div>
            )}
          </div>
        )}

        {error && <div className="text-primary font-bold text-sm bg-primary/10 border-2 border-primary/25 rounded-lg px-3 py-2 mt-3">{error}</div>}
      </div>

      {/* 底栏 */}
      {parsed && (
        <div className="shrink-0 px-4 pt-2 pb-3 bg-gradient-to-t from-surface via-surface to-transparent">
          <StickerButton full disabled={busy || !selectedPoi} className="py-4 text-lg" onClick={handleSubmit}>
            <Icon name="edit_note" className="text-2xl" /> {busy ? '提交中…' : isVisit ? '记下这一顿' : '收藏想去'}
          </StickerButton>
        </div>
      )}

      {/* 选店 sheet */}
      {storeSheet && (
        <SheetShell onClose={() => setStoreSheet(false)}>
          <h3 className="font-headline text-xl mb-3">🏪 选哪一家</h3>
          {pois.length === 0 ? (
            <div className="text-center text-on-surface-variant text-sm py-6">
              高德没搜到「{parsed?.store_hint}」<br />
              路边摊 / 家里做的本来就查不到
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pois.map((p) => {
                const sel = selectedPoi?.id === p.id
                const tag = cleanTag(p.business?.tag)
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPoi(p)
                      setStoreSheet(false)
                    }}
                    className={`text-left rounded-xl border-2 border-on-surface p-3 press-sm ${
                      sel ? 'bg-primary/10 shadow-sticker-sm' : 'bg-white shadow-sticker-sm'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      {p.name} {sel && <Icon name="check_circle" className="text-primary" />}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {[tag, p.business?.rating && `⭐${p.business.rating}`, p.business?.cost && `¥${p.business.cost}/人`, p.distance && `📍${fmtDist(p.distance)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                    <div className="text-xs text-on-surface-variant/80 mt-0.5 truncate">
                      {p.adname} · {p.address}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <button onClick={addManualStore} className="w-full mt-3 text-primary font-bold text-sm py-2">
            都不是？✍️ 自己加「{parsed?.store_hint}」
          </button>
        </SheetShell>
      )}

      {/* 金额 sheet */}
      {amountSheet && (
        <SheetShell onClose={() => setAmountSheet(false)}>
          <h3 className="font-headline text-xl mb-3">💰 这顿花了多少</h3>
          <div className="flex gap-3">
            <Field label="总价 ¥" className="flex-1">
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                className={INPUT}
              />
            </Field>
            <Field label="几个人" className="flex-1">
              <input type="number" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value)} className={INPUT} />
            </Field>
          </div>
          <div className="text-center my-3 font-bold">
            人均 <b className="text-primary text-xl">¥{perPerson || '—'}</b>
          </div>
          <StickerButton full onClick={() => setAmountSheet(false)}>
            好了
          </StickerButton>
        </SheetShell>
      )}
    </div>
  )
}

const INPUT = 'w-full rounded-xl border-2 border-on-surface bg-white px-3 py-2.5 outline-none font-body shadow-sticker-sm'

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-sm font-bold text-on-surface-variant mb-1">{label}</label>
      {children}
    </div>
  )
}

function guessMealPeriod(): '早' | '中' | '晚' {
  const h = new Date().getHours()
  if (h < 10) return '早'
  if (h < 16) return '中'
  return '晚'
}

/** 头部问候 + 录入进度 */
function RecordHero() {
  const [stats, setStats] = useState<Stats | null>(null)
  useEffect(() => {
    getStats().then(setStats).catch(() => {})
  }, [])
  const meals = Math.round(useCountUp(stats?.total_visits ?? 0))
  const stores = Math.round(useCountUp(stats?.total_stores_visited ?? 0))
  const h = new Date().getHours()
  const [hEmoji, greet, prompt] =
    h < 5
      ? ['🌙', '夜深了', '宵夜也值得记一笔']
      : h < 11
      ? ['🌅', '早上好', '早上吃了点啥？']
      : h < 14
      ? ['☀️', '中午好', '午饭整了顿啥？']
      : h < 18
      ? ['🌤️', '下午好', '下午茶 / 加餐也算一笔']
      : ['🌙', '晚上好', '今晚吃了点啥？']
  return (
    <div className="sticker p-3 mb-3">
      <div className="font-headline text-lg">
        {hEmoji} {greet}
      </div>
      <div className="text-sm text-on-surface-variant">{prompt}</div>
      {stats &&
        (stats.total_visits > 0 ? (
          <div className="text-xs text-on-surface-variant mt-1">
            地图上已记下 <b className="text-on-surface">{meals}</b> 顿 · <b className="text-on-surface">{stores}</b> 家店 🥢
          </div>
        ) : (
          <div className="text-xs text-on-surface-variant mt-1">记下第一顿，点亮你们的美食地图 ✨</div>
        ))}
    </div>
  )
}

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
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            background: p.bg,
            width: p.w,
            height: p.h,
            ['--drift' as any]: `${p.drift}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  )
}
