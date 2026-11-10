import { lazy, Suspense, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import Button, { Spinner } from '../ui/Button'
import Stamp from '../ui/Stamp'
import Tape from '../ui/Tape'
import SheetShell from '../ui/SheetShell'
import EmptyState from '../ui/EmptyState'
import Presence from '../ui/Presence'
import { PresenceLeaving } from '../ui/presenceContext'
import DateTimeWheel, { NumberWheel } from '../ui/WheelPicker'
import PhotoPicker from '../components/PhotoPicker'
import StoreSearchBox from '../components/StoreSearchBox'
import TasteEditor from '../components/TasteEditor'
import { parseText, search, upsertStore, addVisit, addWish, regeo } from '../api'
import type { ParsedSentence, Point } from '../api'
import { getMyLocation, haversine } from '../lib/geo'
import type { MyLocation } from '../lib/geo'
import { latestTs } from '../lib/browse'
import { cleanTag, inputClass, localDate } from '../lib/format'
import { cuisineEmoji, encodeDishes } from '../lib/taste'
import { useBackClose } from '../lib/useBackClose'
import MoodPicker from '../components/MoodPicker'
import OpenHours from '../components/OpenHours'
import { storeCuisine } from '../components/StoreTimeline'
import type { Mood } from '../lib/moods'

// 地图选点带 leaflet，懒加载（和地图页共享依赖块，不进首屏包）
const LocationPicker = lazy(() => import('../components/LocationPicker'))

const LS_CITY = 'last_city'
const LS_COMPANIONS = 'last_companions'

const EXAMPLES: Array<{ kind: 'eat' | 'wish'; text: string }> = [
  { kind: 'eat', text: '中午和同事去 XX 火锅，一共 90，香辣过瘾还想来' },
  { kind: 'wish', text: '小红书种草 XX 面包店，可颂据说一绝' },
]

// 记完盖章：普通一顿只盖章（快），种草兑现 / 里程碑再加一张卡和撒花
type Celebration = { stamp: string; tone: 'primary' | 'rose' | 'sage'; emoji?: string; title?: string; sub?: ReactNode }

type AddScreenProps = Readonly<{
  points: Point[]
  /** 记完回地图；传了 poiId 地图会飞到这家店 */
  onSubmitted: (poiId?: string) => void
  /** 不记了，回到打开前的地方 */
  onClose: () => void
  circleRole?: string
  /** 在多个圈子时才传：提醒这一笔记到哪个圈 */
  circleName?: string
  presetPoiId?: string | null
}>

const WISH_SOURCES = ['小红书', '抖音', '大众点评', '朋友推荐', '路过']

/** 记一笔：全屏录入，不占 Tab。一句话 AI 解析为主，直搜 / 附近一键为辅 */
export default function AddScreen({ points: allPoints, onSubmitted, onClose, circleRole, circleName, presetPoiId }: AddScreenProps) {
  const leaving = useContext(PresenceLeaving)
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
  const [sentenceOpen, setSentenceOpen] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 直搜入口：不写一句话，选类型 → 搜店名 → 直接进表单
  const [directOpen, setDirectOpen] = useState(false)
  const [directIntent, setDirectIntent] = useState<'visit' | 'wish'>('visit')
  const [manualName, setManualName] = useState<string | null>(null) // 直搜空态转手动加店时的店名

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPoiId, allPoints])

  async function handleParse() {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const p = await parseText(text)
      setParsed(p)
      setSentenceOpen(false)
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
      setDate(p.date || localDate())
      setMeal((p.meal_period as '早' | '中' | '晚') || guessMealPeriod())
    } catch (e: any) {
      setError('解析失败：' + (e?.response?.data?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  /** 不经 AI 解析、拿着一个 poi 直接进详情表单（附近一键记 / 直搜选店 / 直搜手动加店共用） */
  function startWithPoi(poi: any, which: 'visit' | 'wish') {
    setSelectedPoi(poi)
    setParsed({
      intent: which,
      store_hint: poi.name || '',
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
    setIntent(which)
    setAmount('')
    setPeople('2')
    setEmoji('🤤')
    setWantAgain(true)
    setFeeling('')
    setCompanions(localStorage.getItem(LS_COMPANIONS) || '')
    setSource('小红书')
    setReason('')
    setDate(localDate())
    setMeal(guessMealPeriod())
  }

  function addManualStore(loc?: { lng: number; lat: number }) {
    const name = (manualName || parsed?.store_hint || text || '').trim() || '未命名小店'
    const locStr = loc ? `${loc.lng},${loc.lat}` : ''
    const poi = {
      id: 'm_' + Math.random().toString(36).slice(2, 10),
      name,
      location: locStr,
      business: {},
      pname: '',
      cityname: city,
      adname: '',
      address: locStr ? '手动添加 · 地图选点' : '手动添加 · 未定位',
    }
    if (parsed) {
      setSelectedPoi(poi) // 解析流程：字段已填好，只换店
    } else {
      startWithPoi(poi, directIntent) // 直搜流程：从头构造录入态
    }
    setManualName(null)
    setPickingLoc(false)
    setStoreSheet(false)
  }

  function recordNearby(p: Point) {
    startWithPoi(
      {
        id: p.poi_id,
        name: p.name,
        location: `${p.lng},${p.lat}`,
        business: { tag: p.tag, rating: p.rating, cost: p.cost, business_area: p.business_area },
        pname: '',
        cityname: city,
        adname: p.business_area || '',
        address: p.address || '',
      },
      'visit'
    )
  }

  async function handleSubmit() {
    if (busy || celebrate || !selectedPoi || !parsed) return  // busy 兜底：按钮 disabled 渲染前的连点不重复提交
    setBusy(true)
    setError(null)
    try {
      const store = await upsertStore(selectedPoi)
      let cel: Celebration = { stamp: '吃了', tone: 'primary' }
      if (intent === 'wish') {
        await addWish({
          poi_id: store.poi_id,
          store_hint: store.name,
          source: source || '小红书',
          reason: reason || '',
          cuisine: parsed?.cuisine || '',
          flavors: parsed?.flavors || [],
          dishes: encodeDishes(parsed?.dishes || []),
          occasion: parsed?.occasion || '',
        })
        cel = { stamp: '想去', tone: 'rose' }
      } else {
        const res = await addVisit({
          poi_id: store.poi_id,
          date: date || localDate(),
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
          dishes: encodeDishes(parsed?.dishes || []),
          occasion: parsed?.occasion || '',
        })
        if (companions.trim()) localStorage.setItem(LS_COMPANIONS, companions.trim())
        if (res?.fulfilled_wish) {
          cel = {
            stamp: '兑现',
            tone: 'sage',
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
          cel = { stamp: '吃了', tone: 'primary', emoji: res.milestone.emoji, title: res.milestone.title, sub: res.milestone.sub }
        }
      }
      // 没定位的手动店上不了地图，就不飞了
      const landed = selectedPoi?.location ? store.poi_id : undefined
      setCelebrate(cel)
      setTimeout(() => onSubmitted(landed), cel.title ? 2200 : 950)
    } catch (e: any) {
      setError('提交失败：' + (e?.response?.data?.detail || e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  // 有内容才问一句，免得手滑丢了
  const dirty = !!text.trim() || !!feeling.trim() || !!amount || photos.length > 0
  function requestClose() {
    if (celebrate) return
    if (dirty) setConfirmClose(true)
    else onClose()
  }
  useBackClose(!leaving, requestClose)

  const recent = useMemo(
    () =>
      allPoints
        .filter((p) => p.visit_count > 0)
        .sort((a, b) => latestTs(b) - latestTs(a))
        .slice(0, 5),
    [allPoints],
  )

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

  const shell = `absolute inset-0 z-compose paper flex flex-col ${leaving ? 'animate-sheet-down pointer-events-none' : 'animate-sheet-up'}`
  const roundBtn = 'shrink-0 w-10 h-10 rounded-full bg-white shadow-soft ring-1 ring-line flex items-center justify-center press'

  // 观光位没有记录权限：不显示任何录入框，只给提示
  if (circleRole === 'viewer') {
    return (
      <div className={shell}>
        <div className="px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)]">
          <button onClick={onClose} aria-label="关闭" className={roundBtn}>
            <Icon name="close" className="text-[20px]" />
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24">
          <EmptyState
            emoji="👀"
            title="你是观光位"
            desc={
              <>
                在这个圈子里只能看、不能记录。
                <br />
                想一起记？让圈主在「我的圈子」里把你升成「记录员」就行
              </>
            }
          />
        </div>
      </div>
    )
  }

  const greet = greeting()

  return (
    <div className={shell}>
      <Presence show={!!celebrate} duration={260}>
        {celebrate && <CelebrationOverlay cel={celebrate} />}
      </Presence>

      {/* 顶栏：✕ 不记了（解析后是 ← 回到输入）；多个圈子时提醒记到哪 */}
      <div className="shrink-0 flex items-center gap-2.5 px-4 pt-[calc(env(safe-area-inset-top)_+_0.75rem)] pb-2">
        {parsed ? (
          <button onClick={() => setParsed(null)} aria-label="返回重新输入" className={roundBtn}>
            <Icon name="arrow_back" className="text-[20px]" />
          </button>
        ) : (
          <button onClick={requestClose} aria-label="关闭" className={roundBtn}>
            <Icon name="close" className="text-[20px]" />
          </button>
        )}
        {parsed && (
          <Segmented
            value={intent}
            onChange={setIntent}
            options={[
              { key: 'visit', label: '🍴 吃过' },
              { key: 'wish', label: '🌱 想去' },
            ]}
          />
        )}
        <span className="flex-1 min-w-0 flex items-center justify-end gap-1 text-xs text-on-surface-variant">
          {circleName && (
            <>
              <Icon name="group" filled className="text-[15px] shrink-0" />
              <span className="truncate">记到 {circleName}</span>
            </>
          )}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto paper px-4 pt-2 pb-6">
        {!parsed && (
          <div key="compose" className="animate-screen-in">
            {/* 问候大标题 */}
            <header className="mb-4 px-0.5">
              <p className="font-hand text-[24px] leading-none text-primary-dark -rotate-1 origin-left">
                {greet.emoji} {greet.hello}
              </p>
              <h1 className="text-[30px] font-black tracking-tight leading-tight mt-1.5">{greet.prompt}</h1>
            </header>

            {/* 主输入卡：AI 解析时外圈流动彩边 */}
            <div className={`relative rounded-[17px] p-[2px] mb-3 transition-[background] duration-300 ${busy ? 'ai-border' : ''}`}>
              <Tape color="#f3cf6a" angle={-4} width={64} className="-top-2 left-8" />
              <div className="card overflow-hidden focus-within:shadow-ring transition-shadow duration-300">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="一句话就行，比如：今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩"
                  rows={4}
                  maxLength={500}
                  className="ruled w-full bg-transparent outline-none resize-none text-[16px] text-on-surface placeholder:text-on-surface-variant/55"
                />
                {text.length >= 450 && (
                  <div className="px-5 text-right text-xs font-num text-on-surface-variant animate-fade-in">{text.length}/500</div>
                )}
                <div className="flex items-center justify-between gap-2 px-3 pb-3 pt-1">
                  <label className="flex items-center gap-1 bg-surface-2 rounded-full pl-2.5 pr-1 py-1.5">
                    <Icon name="location_on" filled className="text-primary text-base" />
                    <input
                      value={city}
                      onChange={(e) => {
                        cityTouched.current = true
                        setCity(e.target.value)
                      }}
                      aria-label="城市"
                      placeholder="重庆"
                      style={{ width: `${Math.max(2, Math.min(city.length, 6)) + 0.4}em` }}
                      className="bg-transparent outline-none text-[13px] font-medium text-on-surface"
                    />
                  </label>
                  <button
                    disabled={busy || !text.trim()}
                    onClick={handleParse}
                    className={`flex items-center gap-1.5 font-semibold text-[15px] pl-4 pr-5 py-2.5 rounded-full press ${
                      !busy && !text.trim() ? 'bg-surface-2 text-on-surface-variant/70' : 'bg-primary text-white shadow-glow'
                    }`}
                  >
                    {busy ? <Spinner /> : <Icon name="auto_awesome" filled className={`text-[18px] ${text.trim() ? 'text-accent' : ''}`} />}
                    {busy ? 'AI 解析中…' : '解析'}
                  </button>
                </div>
              </div>
            </div>

            {/* 直搜入口：AI 识别不靠谱时的稳妥路——自己选类型、自己搜店名 */}
            {!directOpen ? (
              <button onClick={() => setDirectOpen(true)} className="w-full text-left card px-4 py-3.5 mb-3 flex items-center gap-3 press">
                <span className="w-10 h-10 rounded-2xl bg-surface-2 flex items-center justify-center shrink-0">
                  <Icon name="search" className="text-on-surface-variant" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">直接搜店名记一笔</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">不想打字描述？搜到店选一下就行</div>
                </div>
                <Icon name="chevron_right" className="text-on-surface-variant/60 shrink-0" />
              </button>
            ) : (
              <div className="card p-4 mb-3 animate-pop-in origin-top">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <Segmented
                    value={directIntent}
                    onChange={setDirectIntent}
                    options={[
                      { key: 'visit', label: '🍴 吃过' },
                      { key: 'wish', label: '🌱 想去' },
                    ]}
                  />
                  <button
                    onClick={() => setDirectOpen(false)}
                    aria-label="收起直搜"
                    className="shrink-0 w-8 h-8 rounded-full bg-surface-2 text-on-surface-variant flex items-center justify-center press-sm"
                  >
                    <Icon name="close" className="text-[18px]" />
                  </button>
                </div>
                <StoreSearchBox
                  city={city}
                  location={myLocation ? `${myLocation.lng},${myLocation.lat}` : undefined}
                  localPoints={allPoints}
                  autoFocus
                  placeholder="店名，比如：珮姐老火锅"
                  onPick={(poi) => startWithPoi(poi, directIntent)}
                  emptyActionLabel="✍️ 手动加这家店"
                  onEmptyAction={(q) => {
                    setManualName(q)
                    setPickingLoc(true)
                  }}
                />
              </div>
            )}

            {/* 附近一键记 */}
            {nearby && (
              <button onClick={() => recordNearby(nearby)} className="w-full text-left card px-4 py-3.5 mb-3 flex items-center gap-3 press animate-fade-up">
                <span className="relative w-10 h-10 rounded-2xl bg-primary-soft flex items-center justify-center shrink-0 text-xl">
                  {nearby.visit_count > 0 ? '📍' : '💘'}
                  <span className="absolute -top-0.5 -right-0.5 flex w-3 h-3">
                    <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                    <span className="relative w-3 h-3 rounded-full bg-primary ring-2 ring-white" />
                  </span>
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px] truncate">就在「{nearby.name}」附近</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">
                    {nearby.visit_count > 0 ? '又来啦？一键再记一笔' : '你想去的店就在眼前 · 点一下直接打卡'}
                  </div>
                </div>
                <span className="text-primary font-semibold text-sm shrink-0">记这家</span>
              </button>
            )}

            {/* 示例 */}
            {recent.length > 0 && (
              <>
                <div className="section-label mt-6 mb-2 px-0.5">最近记过，一点就接着记</div>
                <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4">
                  {recent.map((p) => (
                    <button
                      key={p.poi_id}
                      onClick={() => recordNearby(p)}
                      className="shrink-0 max-w-[11rem] flex items-center gap-1.5 rounded-full bg-white shadow-soft ring-1 ring-line pl-2.5 pr-3.5 py-2 text-[13px] font-medium press"
                    >
                      <span className="text-base leading-none">{cuisineEmoji(storeCuisine(p))}</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="section-label mt-6 mb-1 px-0.5">不知道怎么写？点一条直接套用</div>
            <div className="divide-y divide-line mb-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setText(ex.text)
                    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="w-full flex items-start gap-2.5 text-left px-0.5 py-3 press-sm"
                >
                  <span className="text-base leading-6 shrink-0">{ex.kind === 'eat' ? '🍴' : '🌱'}</span>
                  <span className="text-sm text-on-surface/80 leading-6">{ex.text}</span>
                </button>
              ))}
            </div>

            {myLocation && (
              <p className="flex items-center justify-center gap-1 text-center text-xs text-on-surface-variant/80 mt-4 mb-2">
                <Icon name="my_location" className="text-sm" /> 已定位，优先搜附近
              </p>
            )}
          </div>
        )}

        {parsed && (
          <div key="review" className="animate-screen-in">
            {/* 原话：默认收成一行引用，想改再展开（做完解析它就不是主角了） */}
            {sentenceOpen ? (
              <div className={`rounded-[17px] p-[2px] mb-3 transition-[background] duration-300 animate-pop-in origin-top ${busy ? 'ai-border' : ''}`}>
                <div className="card overflow-hidden focus-within:shadow-ring transition-shadow duration-300">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="例如：今晚和朋友去家川菜馆，人均 80，水煮鱼挺嫩"
                    rows={2}
                    maxLength={500}
                    autoFocus
                    className="ruled w-full bg-transparent outline-none resize-none text-[15px] text-on-surface placeholder:text-on-surface-variant/55"
                  />
                  {text.length >= 450 && <div className="px-5 text-right text-xs font-num text-on-surface-variant">{text.length}/500</div>}
                  <div className="flex items-center justify-end gap-2 px-3 pb-3 pt-1">
                    <button onClick={() => setSentenceOpen(false)} className="text-[13px] font-medium text-on-surface-variant px-3 py-1.5 press-sm">
                      收起
                    </button>
                    <button
                      disabled={busy || !text.trim()}
                      onClick={handleParse}
                      className="shrink-0 flex items-center gap-1 text-[13px] font-semibold text-primary-dark bg-primary-soft rounded-full px-3.5 py-1.5 press-sm disabled:opacity-50"
                    >
                      {busy ? <Spinner className="!w-3.5 !h-3.5" /> : <Icon name="auto_awesome" className="text-[16px]" />}
                      {busy ? '识别中' : '重新识别'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-3 px-0.5">
                {text.trim() && <p className="text-sm text-on-surface-variant leading-relaxed line-clamp-2">“{text.trim()}”</p>}
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p className="flex items-center gap-1 text-xs font-medium text-primary-dark min-w-0">
                    {text.trim() && (
                      <>
                        <Icon name="auto_awesome" filled className="text-[14px] text-accent" /> AI 认出了下面这些，不对就点一下改
                      </>
                    )}
                  </p>
                  <button onClick={() => setSentenceOpen(true)} className="shrink-0 flex items-center gap-1 text-xs font-medium text-on-surface-variant py-1 press-sm">
                    <Icon name="edit" className="text-[14px]" /> {text.trim() ? '改这句话' : '写一句让 AI 填'}
                  </button>
                </div>
              </div>
            )}

            {/* 店铺卡 */}
            <div className="card p-3.5 mb-3 flex items-center gap-3 stagger" style={{ '--i': 0 } as React.CSSProperties}>
              <span className="w-12 h-12 rounded-2xl bg-primary-soft text-primary flex items-center justify-center shrink-0">
                <Icon name="storefront" className="text-[25px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-bold leading-snug line-clamp-2">{selectedPoi?.name || '还没选店'}</div>
                <div className="text-xs text-on-surface-variant truncate mt-0.5">
                  {[
                    selectedPoi?.adname || selectedPoi?.business?.business_area,
                    cleanTag(selectedPoi?.business?.tag),
                    selectedPoi?.business?.rating && `⭐ ${selectedPoi.business.rating}`,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '点「换一家」选一个'}
                </div>
                <OpenHours opentime={selectedPoi?.business?.opentime_today || selectedPoi?.business?.opentime_week} className="mt-0.5" />
              </div>
              <button onClick={() => setStoreSheet(true)} className="shrink-0 text-[13px] font-semibold rounded-full px-3 py-1.5 bg-surface-2 press-sm">
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

            {isVisit && (
              <div className="mt-5 mb-5">
                  <div className="flex items-center justify-between gap-2 mb-3 px-0.5">
                    <p className="text-lg font-bold tracking-tight">这一顿，好吃吗？</p>
                    <button
                      onClick={() => setWantAgain((a) => !a)}
                      aria-pressed={wantAgain}
                      className={`shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-semibold press-sm transition-colors ${
                        wantAgain ? 'bg-rose-soft text-rose-ink' : 'bg-surface-2 text-on-surface-variant'
                      }`}
                    >
                      <Icon key={String(wantAgain)} name="favorite" filled={wantAgain} className="text-[15px] animate-pop-in" /> 还想来
                    </button>
                  </div>
                  <MoodPicker value={emoji} onChange={setEmoji} />
              </div>
            )}

            {/* 信息格（点一下可改） */}
            {isVisit && (
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <InfoTile i={1} icon="calendar_month" label="哪天 · 哪顿" value={`${(date || '').slice(5).replace('-', '/')} · ${meal}`} onClick={() => setTimeSheet(true)} />
                <InfoTile
                  i={2}
                  icon="payments"
                  label={perPerson ? `花了多少 · 人均 ¥${perPerson}` : '花了多少'}
                  value={amount ? `¥${amount}` : '填金额'}
                  muted={!amount}
                  onClick={() => setAmountSheet(true)}
                />
                <InfoTile i={3} icon="group" label="和谁" value={`${companions || '和谁'} · ${people}人`} muted={!companions} onClick={() => setCompanionsSheet(true)} />
                <InfoTile i={4} icon="chat_bubble" label="点评" value={feeling || '加点评'} muted={!feeling} onClick={() => setFeelingSheet(true)} />
              </div>
            )}

            {!isVisit && (
              <div className="space-y-4 mt-5 mb-6">
                <Field label="来源">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {WISH_SOURCES.map((w) => (
                      <button key={w} onClick={() => setSource(w)} aria-pressed={source === w} className={`chip press-sm !text-[13px] !py-1 ${source === w ? 'chip-on' : 'bg-white ring-1 ring-line'}`}>
                        {w}
                      </button>
                    ))}
                  </div>
                  <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="也可以自己写" className={INPUT} />
                </Field>
                <Field label="理由">
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="为什么想去？一句话" className={INPUT} />
                </Field>
              </div>
            )}

            {isVisit && (
              <div className="mb-6">
                  <div className="section-label mb-2.5 px-0.5">照片</div>
                  <PhotoPicker photos={photos} onChange={setPhotos} max={4} />
              </div>
            )}

            {/* 口味标签（AI 抽的，抽错可改；菜品可标赞/雷） */}
            <div className="mb-6">
              <div className="section-label mb-2.5 px-0.5">口味标签</div>
              <TasteEditor
                cuisine={parsed.cuisine || ''}
                flavors={parsed.flavors || []}
                dishes={parsed.dishes || []}
                onChange={(patch) => setParsed({ ...parsed, ...patch })}
              />
            </div>

          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-primary-dark text-sm bg-primary-soft rounded-2xl px-3.5 py-2.5 mt-3 animate-fade-up">
            <Icon name="error" className="text-[18px] mt-px" />
            {error}
          </div>
        )}
      </div>

      {/* 底栏 */}
      {parsed && (
        <div className="shrink-0 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-up">
          <Button full loading={busy} disabled={!selectedPoi} className="!py-3.5 text-base" onClick={handleSubmit}>
            {!busy && <Icon name="edit_note" className="text-[22px]" />} {busy ? '提交中…' : isVisit ? '记下这一顿' : '收藏想去'}
          </Button>
        </div>
      )}

      {/* 有内容时关闭：确认一下 */}
      <Presence show={confirmClose}>
        {confirmClose && (
          <SheetShell onClose={() => setConfirmClose(false)}>
            <div className="text-center pt-1">
              <p className="text-xl font-bold tracking-tight">这一笔不记了？</p>
              <p className="text-sm text-on-surface-variant mt-1 mb-6">写的内容不会保存</p>
            </div>
            <div className="flex gap-2.5">
              <Button variant="soft" className="flex-1" onClick={onClose}>
                不记了
              </Button>
              <Button className="flex-1" onClick={() => setConfirmClose(false)}>
                继续记
              </Button>
            </div>
          </SheetShell>
        )}
      </Presence>

      {/* 选店 sheet：预置解析时搜到的候选，改词可就地重搜（不必重写一句话） */}
      <Presence show={storeSheet}>
        {storeSheet && (
          <SheetShell onClose={() => setStoreSheet(false)}>
            <h3 className="text-xl font-bold tracking-tight mb-4">选哪一家</h3>
            <StoreSearchBox
              city={city}
              location={myLocation ? `${myLocation.lng},${myLocation.lat}` : undefined}
              localPoints={allPoints}
              initialQuery={parsed?.store_hint || ''}
              initialResults={pois}
              onPick={(poi) => {
                setSelectedPoi(poi)
                setStoreSheet(false)
              }}
            />
            <button
              onClick={() => {
                setStoreSheet(false)
                setPickingLoc(true)
              }}
              className="w-full mt-3 text-primary font-semibold text-sm py-2 press-sm"
            >
              都不是？✍️ 自己加「{parsed?.store_hint}」
            </button>
          </SheetShell>
        )}
      </Presence>

      {/* 金额 sheet */}
      <Presence show={amountSheet}>
        {amountSheet && (
          <SheetShell onClose={() => setAmountSheet(false)}>
            <h3 className="text-xl font-bold tracking-tight mb-4">这顿花了多少</h3>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-num text-2xl text-on-surface-variant">¥</span>
              <input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
                aria-label="总价"
                placeholder="总价"
                className={INPUT + ' !pl-10 !py-4 font-num text-2xl tabular-nums'}
              />
            </div>
            {!!amount && Number(people) > 0 && (
              <div className="text-center mt-4 text-on-surface-variant animate-fade-in">
                {people} 人 · 人均 <b key={perPerson} className="inline-block font-num text-primary text-2xl animate-pop-in">¥{perPerson || '—'}</b>
              </div>
            )}
            <Button full className="mt-5" onClick={() => setAmountSheet(false)}>
              好了
            </Button>
          </SheetShell>
        )}
      </Presence>

      {/* 和谁 sheet（含人数） */}
      <Presence show={companionsSheet}>
        {companionsSheet && (
          <SheetShell onClose={() => setCompanionsSheet(false)}>
            <h3 className="text-xl font-bold tracking-tight mb-4">和谁一起</h3>
            <Field label="和谁">
              <input value={companions} onChange={(e) => setCompanions(e.target.value)} placeholder="比如：朋友 / 同事 / 一个人" className={INPUT} />
            </Field>
            <Field label="几个人" className="mt-4">
              <NumberWheel value={Number(people) || 1} onChange={(v) => setPeople(String(v))} max={30} unit="人" />
            </Field>
            <Button full className="mt-5" onClick={() => setCompanionsSheet(false)}>
              好了
            </Button>
          </SheetShell>
        )}
      </Presence>

      {/* 时间 sheet：日期 + 餐段 */}
      <Presence show={timeSheet}>
        {timeSheet && (
          <SheetShell onClose={() => setTimeSheet(false)}>
            <h3 className="text-xl font-bold tracking-tight mb-4">哪天 · 哪顿</h3>
            <DateTimeWheel value={date} onChange={setDate} meal={meal} onMealChange={setMeal} />
            <Button full className="mt-5" onClick={() => setTimeSheet(false)}>
              好了
            </Button>
          </SheetShell>
        )}
      </Presence>

      {/* 点评 sheet */}
      <Presence show={feelingSheet}>
        {feelingSheet && (
          <SheetShell onClose={() => setFeelingSheet(false)}>
            <h3 className="text-xl font-bold tracking-tight mb-4">加点评</h3>
            <textarea
              value={feeling}
              onChange={(e) => setFeeling(e.target.value)}
              rows={4}
              autoFocus
              placeholder="好吃在哪？想说点啥…"
              className={INPUT + ' resize-none leading-relaxed'}
            />
            <Button full className="mt-5" onClick={() => setFeelingSheet(false)}>
              好了
            </Button>
          </SheetShell>
        )}
      </Presence>

      {/* 手动加店：在地图上把针对准店的位置（高德搜不到的小店也能定位上图） */}
      <Presence show={pickingLoc}>
        {pickingLoc && (
          <Suspense fallback={null}>
            <LocationPicker
              center={pickerCenter}
              storeName={(manualName || parsed?.store_hint || '').trim() || '这家店'}
              onPick={(lng, lat) => addManualStore({ lng, lat })}
              onSkip={() => addManualStore()}
              onClose={() => {
                setPickingLoc(false)
                if (parsed) setStoreSheet(true) // 解析流程从选店 sheet 来，返回去；直搜流程回直搜面板
              }}
            />
          </Suspense>
        )}
      </Presence>
    </div>
  )
}

const INPUT = inputClass

function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block section-label mb-1.5 px-0.5">{label}</label>
      {children}
    </div>
  )
}

/** 解析结果里的一格信息：小标签 + 值，点开对应的小抽屉改 */
function InfoTile({
  i,
  icon,
  label,
  value,
  muted = false,
  onClick,
}: {
  i: number
  icon: string
  label: string
  value: string
  muted?: boolean
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="card stagger flex flex-col gap-1 text-left px-3.5 py-3 press min-w-0" style={{ '--i': i } as React.CSSProperties}>
      <span className="flex items-center gap-1 text-[11px] text-on-surface-variant whitespace-nowrap">
        <Icon name={icon} className="text-[15px] text-primary" />
        {label}
      </span>
      <span className={`w-full text-[15px] font-semibold truncate ${muted ? 'text-on-surface-variant/60' : 'text-on-surface'}`}>{value}</span>
    </button>
  )
}

/** 两段式切换（吃过 / 想去），高亮块会滑动 */
function Segmented<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K
  onChange: (k: K) => void
  options: { key: K; label: string }[]
}) {
  const idx = Math.max(0, options.findIndex((o) => o.key === value))
  return (
    <div className="relative inline-flex rounded-full bg-surface-2 p-1">
      <span
        aria-hidden
        className="absolute top-1 bottom-1 left-1 rounded-full bg-on-surface transition-transform duration-500 ease-spring"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`relative px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors duration-300 ${
            o.key === value ? 'text-white' : 'text-on-surface-variant'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function guessMealPeriod(): '早' | '中' | '晚' {
  const h = new Date().getHours()
  if (h < 10) return '早'
  if (h < 16) return '中'
  return '晚'
}

/** 按时段的问候 + 提问 */
function greeting() {
  const h = new Date().getHours()
  if (h < 5) return { emoji: '🌙', hello: '夜深了', prompt: '宵夜也值得记一笔' }
  if (h < 11) return { emoji: '🌅', hello: '早上好', prompt: '早上吃了点啥？' }
  if (h < 14) return { emoji: '☀️', hello: '中午好', prompt: '午饭整了顿啥？' }
  if (h < 18) return { emoji: '🌤️', hello: '下午好', prompt: '下午茶也算一笔' }
  return { emoji: '🌙', hello: '晚上好', prompt: '今晚吃了点啥？' }
}

/** 记一笔高光时刻：一枚章砸下来答「吃了」，纸面一震；里程碑再加卡片和撒花 */
function CelebrationOverlay({ cel }: { cel: Celebration }) {
  const leaving = useContext(PresenceLeaving)
  return (
    <div
      className={`fixed inset-0 z-overlay flex items-center justify-center p-6 ${cel.title ? 'bg-[#24190f]/50' : 'bg-surface/75'} ${leaving ? 'animate-fade-out' : 'animate-fade-in'}`}
      style={{ WebkitBackdropFilter: 'blur(3px)', backdropFilter: 'blur(3px)' }}
    >
      {cel.title && <Confetti />}
      {cel.title ? (
        <div className="card relative px-8 py-8 text-center animate-pop-in max-w-[300px] stamp-impact" style={{ '--impact-delay': '680ms' } as React.CSSProperties}>
          <div className="text-[56px] leading-none mb-3">{cel.emoji}</div>
          <div className="text-2xl font-bold tracking-tight mb-1.5">{cel.title}</div>
          <div className="text-sm text-on-surface-variant leading-relaxed">{cel.sub}</div>
          <span className="absolute top-2.5 right-2.5" style={{ '--slam-delay': '420ms' } as React.CSSProperties}>
            <Stamp text={cel.stamp} tone={cel.tone} size={68} slam />
          </span>
        </div>
      ) : (
        <span className="stamp-impact" style={{ '--impact-delay': '310ms' } as React.CSSProperties}>
          <Stamp text={cel.stamp} tone={cel.tone} size={132} slam />
        </span>
      )}
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
