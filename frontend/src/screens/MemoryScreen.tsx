import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import type { Point } from '../api'
import { cleanTag } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'

type MemoryScreenProps = Readonly<{
  points: Point[]
  onClose: () => void
}>

function Num({ value }: { value: number }) {
  const v = useCountUp(value)
  return <span className="font-num">{Math.round(v)}</span>
}

// 每张卡：emoji 主图 + 小标签 + 大数值 + 文艺详情 + 可选 pill + 该章节的水彩辉光配色
type Card = {
  emoji: string
  label?: ReactNode
  value: ReactNode
  detail?: ReactNode
  pills?: { text: string }[]
  glow: [string, string] // [近辉光, 远辉光]（柔和粉彩）
}

function buildCards(points: Point[]): Card[] {
  const visits = points.flatMap((p) => p.visits.map((v) => ({ v, p })))
  if (visits.length === 0) return []

  const totalVisits = visits.length
  const totalStores = points.filter((p) => p.visit_count > 0).length
  const totalAmount = visits.reduce((s, x) => s + Number(x.v.amount || 0), 0)
  const fulfilled = points.filter((p) => p.wish && p.wish.status === 'visited').length
  const openWishes = points.filter((p) => p.wish && p.wish.status === 'want').length
  const mostVisited = points.filter((p) => p.visit_count > 0).sort((a, b) => b.visit_count - a.visit_count)[0]
  const priciest = visits.filter((x) => Number(x.v.per_person) > 0).sort((a, b) => Number(b.v.per_person) - Number(a.v.per_person))[0]

  // 开篇：最早的一顿
  const byDate = visits.slice().sort((a, b) => (a.v.date || '').localeCompare(b.v.date || ''))
  const firstMeal = byDate[0]
  const firstMonth = firstMeal?.v.date ? Number(firstMeal.v.date.slice(5, 7)) : 0

  // 足迹：去过的不同商圈 / 街区
  const areaSet = new Set<string>()
  points.forEach((p) => {
    if (p.visit_count > 0) {
      const a = (p.business_area || p.district || '').trim()
      if (a) areaSet.add(a)
    }
  })
  const areaCount = areaSet.size

  // 最贪吃的月份
  const monthCt: Record<string, number> = {}
  visits.forEach(({ v }) => {
    const m = (v.date || '').slice(0, 7)
    if (m) monthCt[m] = (monthCt[m] || 0) + 1
  })
  const busiest = Object.entries(monthCt).sort((a, b) => b[1] - a[1])[0]
  const busiestMonth = busiest ? Number(busiest[0].slice(5, 7)) : 0
  const busiestCount = busiest ? busiest[1] : 0

  // 吃完就想再来
  const wantAgainCount = visits.filter((x) => Number(x.v.want_again) > 0).length

  // 标签 / 菜系 / 口味 / 菜品 / 场景
  const tagCount: Record<string, number> = {}
  points.forEach((p) => {
    if (p.visit_count > 0) {
      const t = cleanTag(p.tag, 1)
      if (t) tagCount[t] = (tagCount[t] || 0) + p.visit_count
    }
  })
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0])

  const cuiCt: Record<string, number> = {}
  const flaCt: Record<string, number> = {}
  const occCt: Record<string, number> = {}
  const dishCt: Record<string, number> = {}
  let yummyCount = 0
  visits.forEach(({ v }) => {
    if (v.cuisine) cuiCt[v.cuisine] = (cuiCt[v.cuisine] || 0) + 1
    ;(v.flavors || '').split(/[,，]/).forEach((f) => {
      const t = f.trim()
      if (t) flaCt[t] = (flaCt[t] || 0) + 1
    })
    ;(v.dishes || '').split(/[,，、]/).forEach((d) => {
      const t = d.trim()
      if (t) dishCt[t] = (dishCt[t] || 0) + 1
    })
    if (v.occasion) occCt[v.occasion] = (occCt[v.occasion] || 0) + 1
    if (v.mood_emoji === '😋' || v.mood_emoji === '🤤') yummyCount++
  })
  const topN = (o: Record<string, number>, n: number) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0])
  const topCuisines = topN(cuiCt, 3).length ? topN(cuiCt, 3) : topTags
  const topFlavors = topN(flaCt, 3)
  const topOcc = Object.entries(occCt).sort((a, b) => b[1] - a[1])[0]
  const topDish = Object.entries(dishCt).sort((a, b) => b[1] - a[1])[0]

  const dates = byDate.map((x) => x.v.date).filter(Boolean)
  const fmt = (d: string) => d.slice(0, 7).replace('-', '.')
  const range = dates.length ? (fmt(dates[0]) === fmt(dates[dates.length - 1]) ? fmt(dates[0]) : `${fmt(dates[0])} — ${fmt(dates[dates.length - 1])}`) : ''

  const cards: Card[] = []

  // 1 · 封面
  cards.push({
    emoji: '🍜',
    value: (
      <>
        我们的
        <br />
        美食回忆
      </>
    ),
    detail: (
      <>
        {range || '一段还在生长的食光'}
        <br />
        <span className="opacity-75">一蔬一饭，皆与你共</span>
      </>
    ),
    glow: ['#FBD9A8', '#F6B98C'],
  })

  // 2 · 开篇（最早一顿）
  if (firstMeal) {
    cards.push({
      emoji: '🌅',
      label: '翻开这一年',
      value: <>「{firstMeal.p.name}」</>,
      detail: (
        <>
          <Num value={firstMonth} /> 月的第一顿 · 故事就此开场
        </>
      ),
      glow: ['#FAD7B0', '#F3C19A'],
    })
  }

  // 3 · 总览
  cards.push({
    emoji: '🥢',
    label: '舌尖上的一年',
    value: (
      <>
        <Num value={totalVisits} /> 顿饭
      </>
    ),
    detail: (
      <>
        走过 <Num value={totalStores} /> 家店 · 一起花掉 ¥<Num value={Math.round(totalAmount)} /> 的人间烟火
      </>
    ),
    pills: [{ text: '⭐ 食过留香' }, { text: '❤️ 念念不忘' }],
    glow: ['#F8C9A8', '#F4A98C'],
  })

  // 4 · 足迹
  if (areaCount >= 2) {
    cards.push({
      emoji: '👣',
      label: '我们的脚步',
      value: (
        <>
          <Num value={areaCount} /> 个街区
        </>
      ),
      detail: <>把这座城，一口一口吃成了主场</>,
      glow: ['#CFE3C9', '#A8D0B0'],
    })
  }

  // 5 · 最爱
  if (mostVisited && mostVisited.visit_count >= 2) {
    cards.push({
      emoji: '❤️',
      label: '百去不厌',
      value: <>「{mostVisited.name}」</>,
      detail: (
        <>
          一去再去 <Num value={mostVisited.visit_count} /> 次 · 像回了家
        </>
      ),
      glow: ['#F8C6CE', '#F2A6B4'],
    })
  }

  // 6 · 最贪吃的月份
  if (busiestCount >= 3) {
    cards.push({
      emoji: '🌙',
      label: '最贪吃的月份',
      value: (
        <>
          <Num value={busiestMonth} /> 月
        </>
      ),
      detail: (
        <>
          那个月吃了 <Num value={busiestCount} /> 顿 · 把日子过成了节
        </>
      ),
      glow: ['#CFE0EE', '#AFC9E6'],
    })
  }

  // 7 · 最郑重的一顿
  if (priciest) {
    cards.push({
      emoji: '🥂',
      label: '最郑重的一顿',
      value: <>「{priciest.p.name}」</>,
      detail: (
        <>
          人均 ¥<Num value={Number(priciest.v.per_person)} /> · 那一天，我们值得
        </>
      ),
      glow: ['#FBE0A6', '#F4CC78'],
    })
  }

  // 8 · 口味
  if (topCuisines.length || topFlavors.length) {
    cards.push({
      emoji: '😋',
      label: '你们的偏爱',
      value: topCuisines.length ? <>{topCuisines.join(' · ')}</> : <>百味皆尝</>,
      detail: topFlavors.length ? <>舌尖总往「{topFlavors.join(' · ')}」里钻</> : <>什么都肯尝一口</>,
      glow: ['#E8D3F0', '#D2AEE6'],
    })
  }

  // 9 · 最难忘的一道菜
  if (topDish) {
    cards.push({
      emoji: '🍲',
      label: '念念不忘的一口',
      value: <>{topDish[0]}</>,
      detail:
        topDish[1] >= 2 ? (
          <>
            点了 <Num value={topDish[1]} /> 次 · 每次都说「就它了」
          </>
        ) : (
          <>一口入心 · 久久不忘</>
        ),
      glow: ['#F7CBB0', '#EFAE8E'],
    })
  }

  // 10 · 吃完就想再来
  if (wantAgainCount >= 2) {
    cards.push({
      emoji: '🫶',
      label: '放下筷子就想念',
      value: (
        <>
          <Num value={wantAgainCount} /> 顿
        </>
      ),
      detail: <>有些味道，刚吃完就开始馋下一次</>,
      glow: ['#F8D7B0', '#F0B78C'],
    })
  }

  // 11 · 最多的相聚
  if (topOcc && topOcc[1] >= 2) {
    cards.push({
      emoji: '💞',
      label: '最多的相聚',
      value: <>「{topOcc[0]}」饭</>,
      detail: (
        <>
          一起吃了 <Num value={topOcc[1]} /> 顿 · 把寻常过成了浪漫
        </>
      ),
      glow: ['#F4C9D6', '#E9A6C0'],
    })
  }

  // 12 · 太好吃
  if (yummyCount >= 2) {
    cards.push({
      emoji: '🤤',
      label: '脱口而出',
      value: (
        <>
          <Num value={yummyCount} /> 声「太好吃」
        </>
      ),
      detail: <>原来幸福，一口就够</>,
      glow: ['#FBE0A6', '#F6C788'],
    })
  }

  // 13 · 种草兑现
  if (fulfilled > 0 || openWishes > 0) {
    cards.push({
      emoji: '✨',
      label: '种草兑现',
      value: (
        <>
          <Num value={fulfilled} /> 家
        </>
      ),
      detail: openWishes > 0 ? <>还有 {openWishes} 家在清单上 · 我们有的是日子</> : <>清单都清空啦，太厉害</>,
      glow: ['#D6E8B8', '#B6D88C'],
    })
  }

  // 14 · 尾页
  cards.push({ emoji: '🗺️', value: <>故事还在继续</>, detail: '未完待续 · 下一顿，还和你', glow: ['#FBD9A8', '#F6B98C'] })
  return cards
}

// 散落暖金粒（柔和闪烁）
const SPARKS = [
  { t: '11%', l: '16%', s: 'text-base', d: '0s' },
  { t: '17%', l: '80%', s: 'text-sm', d: '1.1s' },
  { t: '38%', l: '9%', s: 'text-xs', d: '2s' },
  { t: '44%', l: '90%', s: 'text-base', d: '.6s' },
  { t: '69%', l: '14%', s: 'text-sm', d: '1.6s' },
  { t: '76%', l: '83%', s: 'text-xs', d: '.3s' },
  { t: '86%', l: '40%', s: 'text-sm', d: '2.4s' },
]

function Sparks() {
  return (
    <>
      {SPARKS.map((s, k) => (
        <span
          key={k}
          aria-hidden
          className={`pointer-events-none absolute z-0 select-none text-[#E0A24E] animate-mem-twinkle ${s.s}`}
          style={{ top: s.t, left: s.l, animationDelay: s.d }}
        >
          ✦
        </span>
      ))}
    </>
  )
}

/** 年度回忆报告 · 明亮暖色编辑风：奶油底 + 水彩极光 + 白瓷毛玻璃 + 陶土/金衬线大字 + 全屏轻点翻页 */
export default function MemoryScreen({ points, onClose }: MemoryScreenProps) {
  const cards = useMemo(() => buildCards(points), [points])
  const [i, setI] = useState(0)

  const shell = 'fixed inset-0 z-[1300] flex items-center justify-center overflow-hidden px-6 text-center'
  const baseBg = 'radial-gradient(135% 120% at 50% 0%, #FFF9EF 0%, #FDF1E2 52%, #FAE6D4 100%)'

  if (cards.length === 0) {
    return (
      <div className={shell} style={{ background: baseBg }}>
        <Sparks />
        <button
          onClick={onClose}
          className="absolute right-4 top-[max(0.8rem,env(safe-area-inset-top))] z-30 grid h-10 w-10 place-items-center rounded-full border border-[#3d2b1a]/20 bg-white/50 text-[#6E5A45] backdrop-blur-sm transition active:scale-95"
        >
          <Icon name="close" />
        </button>
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-6 text-6xl animate-mem-float [filter:drop-shadow(0_8px_18px_rgba(196,120,70,.28))]">🍜</div>
          <div className="font-serifcjk text-3xl font-bold text-[#3d2b1a]">回忆还在路上</div>
          <div className="mt-2 font-body text-sm text-[#8A7560]">先记几顿，再来翻翻你们的故事</div>
        </div>
      </div>
    )
  }

  const card = cards[i]
  const last = i >= cards.length - 1
  const [glowA, glowB] = card.glow

  return (
    <div className={shell} style={{ background: baseBg }}>
      {/* 水彩极光（随章节换色） */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-1/4 -top-1/4 h-[78vh] w-[78vh] rounded-full opacity-55 blur-[88px] animate-mem-aurora"
        style={{ background: `radial-gradient(circle, ${glowA}, transparent 66%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[72vh] w-[72vh] rounded-full opacity-45 blur-[100px] animate-mem-aurora [animation-delay:-7s]"
        style={{ background: `radial-gradient(circle, ${glowB}, transparent 68%)` }}
      />
      {/* 极淡暖边，框住画面又不压暗 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(120% 95% at 50% 30%, transparent 58%, rgba(186,124,74,.12) 100%)' }}
      />
      <Sparks />

      {/* 进度条 */}
      <div className="absolute inset-x-0 top-0 z-30 flex gap-1.5 px-4 pt-[max(0.85rem,env(safe-area-inset-top))]">
        {cards.map((_, idx) => (
          <span key={idx} className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#3d2b1a]/12">
            <span
              className="block h-full rounded-full bg-[#E0703F] transition-all duration-300"
              style={{ width: idx <= i ? '100%' : '0%' }}
            />
          </span>
        ))}
      </div>
      <button
        onClick={onClose}
        className="absolute right-4 top-[max(1.4rem,calc(env(safe-area-inset-top)+0.6rem))] z-30 grid h-10 w-10 place-items-center rounded-full border border-[#3d2b1a]/20 bg-white/50 text-[#6E5A45] backdrop-blur-sm transition active:scale-95"
      >
        <Icon name="close" />
      </button>

      {/* 内容：白瓷毛玻璃卡 */}
      <div className="relative z-10 w-[86%] max-w-sm">
        <div
          key={i}
          className="animate-mem-in rounded-[2rem] border border-white/70 bg-white/60 px-7 py-10 shadow-[0_22px_55px_-22px_rgba(176,118,72,.5)] backdrop-blur-xl"
        >
          {/* emoji 主图 + 暖色辉光底 */}
          <div className="relative mx-auto mb-6 w-fit">
            <div
              aria-hidden
              className="absolute inset-0 -m-5 rounded-full opacity-80 blur-2xl"
              style={{ background: `radial-gradient(circle, ${glowA}, transparent 70%)` }}
            />
            <div className="relative text-[3.15rem] leading-none animate-mem-float [filter:drop-shadow(0_5px_12px_rgba(120,80,50,.28))]">
              {card.emoji}
            </div>
          </div>

          {/* 小标签：陶土色 + 细线 + 字距 */}
          {card.label && (
            <div className="mb-3.5 flex items-center justify-center gap-2.5 text-[#B85C36]">
              <span className="h-px w-5 bg-[#B85C36]/40" />
              <span className="font-body text-[11px] font-bold tracking-[0.3em] pl-[0.3em]">{card.label}</span>
              <span className="h-px w-5 bg-[#B85C36]/40" />
            </div>
          )}

          {/* 大数值：中文衬线深棕，数字 Playfair 陶土色 */}
          <div className="text-balance break-words font-serifcjk text-[2.5rem] font-medium leading-[1.16] text-[#3d2b1a] [&_.font-num]:font-playfair [&_.font-num]:text-[3.5rem] [&_.font-num]:font-semibold [&_.font-num]:text-[#C25B33] [&_.font-num]:[text-shadow:0_2px_16px_rgba(194,91,51,.22)]">
            {card.value}
          </div>

          {/* 文艺详情：细分割线 + 暖棕衬线，内嵌数字走陶土 Playfair */}
          {card.detail && (
            <>
              <span className="mx-auto my-5 block h-px w-12 bg-[#3d2b1a]/12" />
              <div className="font-serifcjk text-[15px] leading-relaxed text-[#6E5A45] [&_.font-num]:font-playfair [&_.font-num]:font-semibold [&_.font-num]:text-[#C25B33]">
                {card.detail}
              </div>
            </>
          )}

          {/* 陶土描边 pill */}
          {card.pills && (
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {card.pills.map((p) => (
                <span
                  key={p.text}
                  className="rounded-full border border-[#C25B33]/30 bg-[#C25B33]/[0.08] px-3.5 py-1.5 font-body text-xs font-semibold tracking-wide text-[#A24A28]"
                >
                  {p.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 轻点翻页区 */}
      <div className="absolute inset-y-0 left-0 z-20 w-1/3" onClick={() => setI((v) => Math.max(0, v - 1))} />
      <div className="absolute inset-y-0 right-0 z-20 w-2/3" onClick={() => (last ? onClose() : setI((v) => v + 1))} />

      {/* 底部提示 */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.6rem,env(safe-area-inset-bottom))] z-30 font-body text-[13px] tracking-wide text-[#9A8570]">
        {last ? '截图分享给 TA 📸 · 轻点退出' : '轻点继续 ›'}
      </div>
    </div>
  )
}
