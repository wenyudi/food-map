import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import StickerButton from '../ui/StickerButton'
import SheetShell from '../ui/SheetShell'
import DateTimeWheel, { NumberWheel } from '../ui/WheelPicker'
import PhotoPicker from '../components/PhotoPicker'
import MonthlySummary from './MonthlySummary'
import { parseText, search, upsertStore, addVisit, addWish, regeo, getPoints } from '../api'
import type { ParsedSentence, Point } from '../api'
import { getMyLocation, haversine } from '../lib/geo'
import type { MyLocation } from '../lib/geo'
import { cleanTag, fmtDist, inputClass } from '../lib/format'
import MoodPicker from '../components/MoodPicker'
import OpenHours from '../components/OpenHours'
import type { Mood } from '../lib/moods'

// 地图选点带 leaflet，懒加载（和地图页共享依赖块，不进首屏包）
const LocationPicker = lazy(() => import('../components/LocationPicker'))

const LS_CITY = 'last_city'
const LS_COMPANIONS = 'last_companions'

const EXAMPLES: Array<{ kind: 'eat' | 'wish'; text: string }> = [
  { kind: 'eat', text: '中午和同事去 XX 火锅，一共 90，香辣过瘾还想来' },
  { kind: 'wish', text: '小红书种草 XX 面包店，可颂据说一绝' },
]

type Celebration = { emoji: string; title: string; sub: ReactNode }

type AddScreenProps = Readonly<{
  onSubmitted: () => void
  circleRole?: string
  presetPoiId?: string | null
  onConsumePreset?: () => void
}>

export default function AddScreen({ onSubmitted, circleRole, presetPoiId, onConsumePreset }: AddScreenProps) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState<Celebration | null>(null)
  const [parsed, setParsed] = useState<ParsedSentence | null>(null)
  const [intent, setIntent] = useState<'visit' | 'wish'>('visit')
  const [pois, setPois] = useState<any[]>([])
  const [selectedPoi, setSelectedPoi] = useState<any>(null)
  // 城市初值用上次记住的（定位没回来前的占位 + 定位失败兜底），但不再用它锁死定位
  const [city, setCity] = useState(() => localStorage.getItem(LS_CITY) || '重庆')
  // 只表示「本次进页面后是否手动改过城市」。每次进录入页都复位 false → 城市能自动跟着定位刷新
  const cityTouched = useRef(false)
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null)
  const [nearby, setNearby] = useState<Point | null>(null)
  const [allPoints, setAllPoints] = useState<Point[]>([])
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
  const [companionsSheet, setCompanionsSheet] = useState(false)
  const [timeSheet, setTimeSheet] = useState(false)
  const [feelingSheet, setFeelingSheet] = useState(false)
  const [pickingLoc, setPickingLoc] = useState(false)

  // 所有点（本月小结 + 附近推荐共用）——与定位解耦，没授权定位也能出小结
  useEffect(() => {
    getPoints().then(setAllPoints).catch(() => {})
  }, [])

  // 定位 → 反查当前城市并自动填入：每次进页面都跟随定位（到外地自动变外地、回来自动变回来）。
  // 仅当本次手动改过城市（cityTouched）才不覆盖；定位失败就保持上次记住的城市不动。
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
    })
  }, [])

  // 附近推荐：定位 + 点都就绪后，挑 250m 内最近的一家
  useEffect(() => {
    if (!myLocation || allPoints.length === 0) return
    let best: Point | null = null
    let bestD = 250
    for (const p of allPoints) {
      if (!p.lng || !p.lat) continue
      const d = haversine(myLocation.lng, myLocation.lat, p.lng, p.lat)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    setNearby(best)
  }, [myLocation, allPoints])

  // 从地图/列表点「记这家」进来：店点加载好后，直接把那家店填进录入态（跳过输入+搜索）
  const presetConsumed = useRef<string | null>(null)
  useEffect(() => {
    if (!presetPoiId || allPoints.length === 0) return
    if (presetConsumed.current === presetPoiId) return
    const p = allPoints.find((x) => x.poi_id === presetPoiId)
    if (!p) return
    presetConsumed.current = presetPoiId
    recordNearby(p)
    onConsumePreset?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPoiId, allPoints])

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

  function addManualStore(loc?: { lng: number; lat: number }) {
    const name = (parsed?.store_hint || text || '').trim() || '未命名小店'
    const locStr = loc ? `${loc.lng},${loc.lat}` : ''
    setSelectedPoi({
      id: 'm_' + Math.random().toString(36).slice(2, 10),
      name,
      location: locStr,
      business: {},
      pname: '',
      cityname: city,
      adname: '',
      address: locStr ? '手动添加 · 地图选点' : '手动添加 · 未定位',
    })
    setPickingLoc(false)
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
      cuisine: null,
      flavors: null,
      dishes: null,
      occasion: null,
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
    if (busy || !selectedPoi || !parsed) return  // busy 兜底：按钮 disabled 渲染前的连点不重复提交
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

  // 地图选点的兜底中心：没定位就用已有店点，再没有就重庆
  const pickerCenter = useMemo<[number, number]>(() => {
    if (myLocation) return [myLocation.lat, myLocation.lng]
    const p = allPoints.find((x) => x.lng && x.lat)
    return p ? [p.lat, p.lng] : [29.56, 106.55]
  }, [myLocation, allPoints])

  // 观光位没有记录权限：不显示任何录入框，只给提示
  if (circleRole === 'viewer') {
    return (
      <div className="h-full flex flex-col items-center justify-center px-8 text-center">
        <div className="text-6xl mb-4">👀</div>
        <h3 className="font-headline text-2xl mb-2">你是观光位</h3>
        <p className="text-on-surface-variant font-bold mb-1">在这个圈子里只能看、不能记录</p>
        <p className="text-sm text-on-surface-variant max-w-[260px]">
          想一起记美食？让圈主在「我的圈子」里把你升成「记录员」就行啦 🍜
        </p>
      </div>
    )
  }

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

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)_+_1rem)] pb-8">
        {!parsed && (
          <>
            {/* 主输入卡（输入框置顶；Stitch 样式：大 textarea + 虚线分隔 + 城市药丸 + ✨解析） */}
            <div className="bg-white border-2 border-on-surface rounded-2xl shadow-sticker overflow-hidden mb-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="例如：今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩"
                rows={4}
                className="w-full p-4 bg-transparent outline-none resize-none font-body font-bold text-on-surface placeholder:font-medium placeholder:text-on-surface-variant/60"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-3 bg-accent/15 border-t-2 border-dashed border-on-surface">
                <label className="flex items-center gap-1 bg-white border-2 border-on-surface rounded-full pl-2.5 pr-1 py-1 shadow-sticker-sm">
                  <Icon name="location_on" className="text-primary text-base" />
                  <span className="text-xs font-bold text-on-surface-variant">城市</span>
                  <input
                    value={city}
                    onChange={(e) => {
                      cityTouched.current = true
                      setCity(e.target.value)
                    }}
                    placeholder="重庆"
                    className="w-16 bg-transparent outline-none text-xs font-bold text-on-surface text-center"
                  />
                </label>
                <button
                  disabled={busy || !text.trim()}
                  onClick={handleParse}
                  className="bg-primary text-white font-headline font-bold text-sm px-6 py-2.5 rounded-full border-2 border-on-surface shadow-sticker press disabled:opacity-50"
                >
                  {busy ? '解析中…' : '✨ 解析'}
                </button>
              </div>
            </div>

            {/* 问候卡（Stitch，暖色渐变；本月数据内嵌其中） */}
            <RecordHero points={allPoints} />

            {/* 附近一键记（保留功能） */}
            {nearby && (
              <button
                onClick={() => recordNearby(nearby)}
                className="w-full text-left sticker p-3 mb-4 flex items-center gap-3 press"
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

            {/* 示例（Stitch 旋转角标；竖排避免横向溢出 + 暖色卡） */}
            <div className="text-sm font-black text-on-surface-variant mb-3">不知道怎么写？点一条直接套用 👇</div>
            <div className="flex flex-col gap-3 pt-1.5 mb-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setText(ex.text)}
                  className={`relative w-full text-left border-2 border-on-surface rounded-2xl shadow-sticker-sm p-4 press-sm ${
                    ex.kind === 'eat' ? 'bg-[#fff5dd]' : 'bg-[#fdece9]'
                  }`}
                >
                  <span
                    className={`absolute -top-2 -right-1.5 border-2 border-on-surface rounded-lg px-2 py-0.5 text-[10px] font-black shadow-sticker-sm ${
                      ex.kind === 'eat' ? 'bg-accent text-on-surface rotate-3' : 'bg-tertiary text-on-surface -rotate-3'
                    }`}
                  >
                    {ex.kind === 'eat' ? '吃过' : '种草'}
                  </span>
                  <p className="text-sm font-bold text-on-surface leading-relaxed pr-10">{ex.text}</p>
                </button>
              ))}
            </div>

            {/* 已定位脚注（Stitch） */}
            {myLocation && (
              <p className="flex items-center justify-center gap-1 text-center text-xs font-bold text-on-surface-variant opacity-80 mt-1 mb-4">
                <Icon name="my_location" className="text-sm" /> 已定位，优先搜附近
              </p>
            )}
          </>
        )}

        {parsed && (
          <div>
            {/* 重新识别输入条（样式同起始页：白卡 + 底部 accent 分隔栏；左放 吃过/还想来，右放 重新识别） */}
            <div className="bg-white border-2 border-on-surface rounded-2xl shadow-sticker overflow-hidden mb-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="例如：今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩"
                rows={2}
                className="w-full p-4 bg-transparent outline-none resize-none font-body font-bold text-on-surface placeholder:font-medium placeholder:text-on-surface-variant/60"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-accent/15 border-t-2 border-dashed border-on-surface">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setIntent(isVisit ? 'wish' : 'visit')}
                    className="shrink-0 px-3 py-1.5 rounded-full border-2 border-on-surface bg-accent text-on-surface text-sm font-bold shadow-sticker-sm press-sm"
                  >
                    {isVisit ? '🍴 吃过' : '🌱 想去'}
                  </button>
                  {isVisit && (
                    <button
                      onClick={() => setWantAgain((a) => !a)}
                      className={`shrink-0 px-3 py-1.5 rounded-full border-2 border-on-surface text-sm font-bold shadow-sticker-sm press-sm ${
                        wantAgain ? 'bg-primary text-white' : 'bg-white text-on-surface-variant'
                      }`}
                    >
                      {wantAgain ? '❤️ 还想来' : '🤍 还想来'}
                    </button>
                  )}
                </div>
                <button
                  disabled={busy || !text.trim()}
                  onClick={handleParse}
                  className="shrink-0 flex items-center gap-1 text-sm font-bold text-white bg-primary border-2 border-on-surface rounded-full px-4 py-1.5 shadow-sticker-sm press-sm disabled:opacity-50"
                >
                  {busy ? '解析中…' : '↻ 重新识别'}
                </button>
              </div>
            </div>

            <p className="flex items-center gap-1 text-sm font-bold text-primary mb-2">
              <Icon name="auto_awesome" className="text-accent" /> AI 认出了这些 👇 点一下可改
            </p>

            {/* 店铺卡（Stitch 风：emoji 头 + 名称 + 菜系评分 + 换一家） */}
            <div className="sticker p-3 mb-3 flex items-center gap-3">
              <span className="w-11 h-11 rounded-full border-2 border-on-surface bg-accent flex items-center justify-center text-xl shrink-0">
                🍲
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-headline text-lg leading-tight truncate">{selectedPoi?.name || '还没选店'}</div>
                <div className="text-xs font-bold text-on-surface-variant truncate">
                  {[
                    selectedPoi?.adname || selectedPoi?.business?.business_area,
                    cleanTag(selectedPoi?.business?.tag),
                    selectedPoi?.business?.rating && `⭐${selectedPoi.business.rating}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '点「换一家」选一个'}
                </div>
                <OpenHours opentime={selectedPoi?.business?.opentime_today || selectedPoi?.business?.opentime_week} className="mt-0.5" />
              </div>
              <button
                onClick={() => setStoreSheet(true)}
                className="shrink-0 text-sm font-bold border-2 border-on-surface rounded-full px-3 py-1 bg-white shadow-sticker-sm press-sm"
              >
                换一家
              </button>
            </div>

            {isManual && (
              <input
                value={selectedPoi?.name || ''}
                onChange={(e) => setSelectedPoi({ ...selectedPoi, name: e.target.value })}
                placeholder="手动店名"
                className={INPUT + ' mb-3'}
              />
            )}

            {/* 信息 chips（点一下可改） */}
            <div className="flex flex-wrap gap-2 mb-5">
              {isVisit && (
                <>
                  <button
                    onClick={() => setTimeSheet(true)}
                    className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold shadow-sticker-sm press-sm"
                  >
                    📅 {(date || '').slice(5).replace('-', '/')} · {meal}
                  </button>
                  <button
                    onClick={() => setAmountSheet(true)}
                    className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold shadow-sticker-sm press-sm"
                  >
                    💰 {amount ? `¥${amount}` : '填金额'}
                  </button>
                  <button
                    onClick={() => setCompanionsSheet(true)}
                    className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-white text-on-surface text-sm font-bold shadow-sticker-sm press-sm"
                  >
                    👥 {companions || '和谁'} · {people}人
                  </button>
                  <button
                    onClick={() => setFeelingSheet(true)}
                    className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-white text-on-surface text-sm font-bold shadow-sticker-sm press-sm max-w-[220px] truncate"
                  >
                    💬 {feeling || '加点评'}
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
              {(parsed.dishes || []).map((d) => (
                <span
                  key={d}
                  className="px-3 py-1.5 rounded-full border-2 border-on-surface bg-white text-on-surface-variant text-sm font-bold"
                >
                  🍽️ {d}
                </span>
              ))}
            </div>

            {isVisit ? (
              <div className="space-y-4">
                <div>
                  <p className="font-headline text-lg mb-2">这一顿，好吃吗？</p>
                  <MoodPicker value={emoji} onChange={setEmoji} />
                </div>

                <div>
                  <label className="block text-sm font-bold text-on-surface-variant mb-1">📷 照片</label>
                  <PhotoPicker photos={photos} onChange={setPhotos} max={4} />
                </div>
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

      {/* 底栏：← 返回（回到输入）+ 记下这一顿 */}
      {parsed && (
        <div className="shrink-0 px-4 pt-2 pb-6 bg-gradient-to-t from-surface via-surface to-transparent">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setParsed(null)}
              aria-label="返回重新输入"
              className="shrink-0 w-14 h-14 rounded-full border-2 border-on-surface bg-white flex items-center justify-center shadow-sticker press"
            >
              <Icon name="arrow_back" className="text-2xl" />
            </button>
            <StickerButton full disabled={busy || !selectedPoi} className="py-4 text-lg" onClick={handleSubmit}>
              <Icon name="edit_note" className="text-2xl" /> {busy ? '提交中…' : isVisit ? '记下这一顿' : '收藏想去'}
            </StickerButton>
          </div>
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
                    <OpenHours opentime={p.business?.opentime_today || p.business?.opentime_week} className="mt-0.5" />
                    <div className="text-xs text-on-surface-variant/80 mt-0.5 truncate">
                      {p.adname} · {p.address}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <button
            onClick={() => {
              setStoreSheet(false)
              setPickingLoc(true)
            }}
            className="w-full mt-3 text-primary font-bold text-sm py-2"
          >
            都不是？✍️ 自己加「{parsed?.store_hint}」
          </button>
        </SheetShell>
      )}

      {/* 金额 sheet */}
      {amountSheet && (
        <SheetShell onClose={() => setAmountSheet(false)}>
          <h3 className="font-headline text-xl mb-3">💰 这顿花了多少</h3>
          <Field label="总价 ¥">
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className={INPUT}
            />
          </Field>
          {!!amount && Number(people) > 0 && (
            <div className="text-center my-3 font-bold">
              人均 <b className="text-primary text-xl">¥{perPerson || '—'}</b> · {people}人
            </div>
          )}
          <StickerButton full className="mt-4" onClick={() => setAmountSheet(false)}>
            好了
          </StickerButton>
        </SheetShell>
      )}

      {/* 和谁 sheet（含人数） */}
      {companionsSheet && (
        <SheetShell onClose={() => setCompanionsSheet(false)}>
          <h3 className="font-headline text-xl mb-3">👥 和谁一起</h3>
          <Field label="和谁">
            <input
              value={companions}
              onChange={(e) => setCompanions(e.target.value)}
              placeholder="比如：朋友 / 同事 / 一个人"
              className={INPUT}
            />
          </Field>
          <Field label="几个人" className="mt-3">
            <NumberWheel value={Number(people) || 1} onChange={(v) => setPeople(String(v))} max={30} unit="人" />
          </Field>
          <StickerButton full className="mt-4" onClick={() => setCompanionsSheet(false)}>
            好了
          </StickerButton>
        </SheetShell>
      )}

      {/* 时间 sheet：日期 + 餐段 */}
      {timeSheet && (
        <SheetShell onClose={() => setTimeSheet(false)}>
          <h3 className="font-headline text-xl mb-3">📅 哪天 · 哪顿</h3>
          <DateTimeWheel value={date} onChange={setDate} meal={meal} onMealChange={setMeal} />
          <StickerButton full className="mt-4" onClick={() => setTimeSheet(false)}>
            好了
          </StickerButton>
        </SheetShell>
      )}

      {/* 点评 sheet（把你的原话做成可改标签） */}
      {feelingSheet && (
        <SheetShell onClose={() => setFeelingSheet(false)}>
          <h3 className="font-headline text-xl mb-3">💬 加点评</h3>
          <div className="sticker p-3">
            <textarea
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              rows={3}
              autoFocus
              placeholder="好吃在哪？想说点啥…"
              className="w-full bg-transparent outline-none resize-none font-body text-on-surface placeholder:text-on-surface-variant/60"
            />
          </div>
          <StickerButton full className="mt-4" onClick={() => setFeelingSheet(false)}>
            好了
          </StickerButton>
        </SheetShell>
      )}

      {/* 手动加店：在地图上把针对准店的位置（高德搜不到的小店也能定位上图） */}
      {pickingLoc && (
        <Suspense fallback={null}>
          <LocationPicker
            center={pickerCenter}
            storeName={(parsed?.store_hint || '').trim() || '这家店'}
            onPick={(lng, lat) => addManualStore({ lng, lat })}
            onSkip={() => addManualStore()}
            onClose={() => {
              setPickingLoc(false)
              setStoreSheet(true)
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

const INPUT = inputClass

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
function RecordHero({ points }: { points: Point[] }) {
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
    <div className="relative bg-gradient-to-br from-[#ffeccb] to-[#fce1da] border-2 border-on-surface rounded-2xl shadow-sticker p-5 mb-5">
      <Icon name="auto_awesome" className="absolute top-4 right-4 text-primary/20 text-4xl" />
      <h2 className="font-headline text-2xl mb-1">
        {hEmoji} {greet}
      </h2>
      <p className="font-body font-bold text-on-surface text-lg mb-4">{prompt}</p>
      <MonthlySummary points={points} refreshKey={0} />
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
