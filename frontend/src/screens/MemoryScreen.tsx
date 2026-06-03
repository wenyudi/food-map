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

// 每张卡：白圆徽章 emoji + 小标签(白) + 大数值(深) + 详情(白药丸) + 可选彩色 pill
type Card = {
  emoji: string
  label?: ReactNode
  value: ReactNode
  detail?: ReactNode
  pills?: { text: string; tone: 'gold' | 'pink' }[]
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
  visits.forEach(({ v }) => {
    if (v.cuisine) cuiCt[v.cuisine] = (cuiCt[v.cuisine] || 0) + 1
    ;(v.flavors || '').split(',').forEach((f) => {
      const t = f.trim()
      if (t) flaCt[t] = (flaCt[t] || 0) + 1
    })
    if (v.occasion) occCt[v.occasion] = (occCt[v.occasion] || 0) + 1
  })
  const topN = (o: Record<string, number>, n: number) =>
    Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0])
  const topCuisines = topN(cuiCt, 3).length ? topN(cuiCt, 3) : topTags
  const topFlavors = topN(flaCt, 3)
  const topOcc = Object.entries(occCt).sort((a, b) => b[1] - a[1])[0]

  const dates = visits.map((x) => x.v.date).filter(Boolean).sort()
  const fmt = (d: string) => d.slice(0, 7).replace('-', '.')
  const range = dates.length ? (fmt(dates[0]) === fmt(dates[dates.length - 1]) ? fmt(dates[0]) : `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`) : ''

  const cards: Card[] = []
  cards.push({ emoji: '🍜', value: <>我们的<br />美食回忆</>, detail: range || '一起点亮的食光' })
  cards.push({
    emoji: '🥢',
    label: '一起吃过',
    value: (
      <>
        <Num value={totalVisits} /> 顿饭
      </>
    ),
    detail: (
      <>
        走进 {totalStores} 家店 · 一起花了 ¥{Math.round(totalAmount)}
      </>
    ),
    pills: [
      { text: '⭐ 每次都解馋', tone: 'gold' },
      { text: '❤️ 想吃一辈子', tone: 'pink' },
    ],
  })
  if (mostVisited && mostVisited.visit_count >= 2) {
    cards.push({
      emoji: '❤️',
      label: '最爱的一家',
      value: <>「{mostVisited.name}」</>,
      detail: (
        <>
          一去再去 <Num value={mostVisited.visit_count} /> 次
        </>
      ),
    })
  }
  if (priciest) {
    cards.push({
      emoji: '💸',
      label: '最奢侈的一顿',
      value: <>「{priciest.p.name}」</>,
      detail: (
        <>
          人均 ¥<Num value={Number(priciest.v.per_person)} />
        </>
      ),
    })
  }
  if (topCuisines.length || topFlavors.length) {
    cards.push({
      emoji: '😋',
      label: '你们的口味',
      value: topCuisines.length ? <>{topCuisines.join(' / ')}</> : <>百味皆尝</>,
      detail: topFlavors.length ? <>偏爱 {topFlavors.join(' / ')}</> : <>什么都爱试试</>,
    })
  }
  if (topOcc && topOcc[1] >= 2) {
    cards.push({
      emoji: '💞',
      label: '最多是',
      value: <>「{topOcc[0]}」饭</>,
      detail: (
        <>
          一起吃了 <Num value={topOcc[1]} /> 顿
        </>
      ),
    })
  }
  if (fulfilled > 0 || openWishes > 0) {
    cards.push({
      emoji: '✨',
      label: '种草兑现',
      value: (
        <>
          <Num value={fulfilled} /> 家
        </>
      ),
      detail: openWishes > 0 ? <>还有 {openWishes} 家在清单上等你们</> : <>清单都清空了，厉害！</>,
    })
  }
  cards.push({ emoji: '🗺️', value: <>故事还在继续</>, detail: '继续点亮你们的美食地图' })
  return cards
}

/** 美食回忆报告：全屏可滑动卡片（Stitch 暖橙渐变 · 白圆徽章 · 大数字 · 白药丸） */
export default function MemoryScreen({ points, onClose }: MemoryScreenProps) {
  const cards = useMemo(() => buildCards(points), [points])
  const [i, setI] = useState(0)

  const shell =
    'fixed inset-0 z-[160] bg-gradient-to-b from-primary via-[#f37a5a] to-[#ffb38a] flex flex-col items-center justify-center text-center px-8 overflow-hidden'

  if (cards.length === 0) {
    return (
      <div className={shell}>
        <Stars />
        <button onClick={onClose} className="absolute top-5 right-5 w-10 h-10 rounded-full border-2 border-white/70 text-white flex items-center justify-center">
          <Icon name="close" />
        </button>
        <div className="w-28 h-28 rounded-full bg-white border-[3px] border-on-surface shadow-sticker flex items-center justify-center text-5xl mb-5">🍜</div>
        <div className="font-headline text-on-surface text-3xl mb-2">回忆还在路上</div>
        <div className="text-white/95">先记几顿，再来翻翻你们的故事</div>
      </div>
    )
  }

  const card = cards[i]
  const last = i >= cards.length - 1
  return (
    <div className={shell}>
      <Stars />

      {/* 进度 */}
      <div className="absolute top-4 left-0 w-full px-5 flex gap-1.5 z-10">
        {cards.map((_, idx) => (
          <span key={idx} className={`flex-1 h-1 rounded-full ${idx <= i ? 'bg-white' : 'bg-white/30'}`} />
        ))}
      </div>
      <button onClick={onClose} className="absolute top-8 right-5 z-10 w-10 h-10 rounded-full border-2 border-white/70 text-white flex items-center justify-center">
        <Icon name="close" />
      </button>

      <div key={i} className="animate-pop flex flex-col items-center relative z-[1]">
        {/* 白圆徽章 */}
        <div className="w-28 h-28 rounded-full bg-white border-[3px] border-on-surface shadow-sticker flex items-center justify-center text-5xl mb-6">
          {card.emoji}
        </div>
        {/* 小标签（白） */}
        {card.label && <div className="text-white font-headline text-xl mb-1">{card.label}</div>}
        {/* 大数值（深色，Stitch 风） */}
        <div className="font-headline text-on-surface text-[2.75rem] leading-tight mb-5 [&_.font-num]:text-[3.75rem]">{card.value}</div>
        {/* 详情：白贴纸药丸 */}
        {card.detail && (
          <div className="bg-white text-on-surface rounded-xl border-2 border-on-surface shadow-sticker px-5 py-2.5 font-bold">
            {card.detail}
          </div>
        )}
        {/* 彩色 pill */}
        {card.pills && (
          <div className="flex gap-2 mt-4 flex-wrap justify-center">
            {card.pills.map((p) => (
              <span
                key={p.text}
                className={`rounded-full border-2 border-on-surface px-3 py-1 text-sm font-bold ${
                  p.tone === 'gold' ? 'bg-accent text-on-surface' : 'bg-white text-primary'
                }`}
              >
                {p.text}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 点击区 */}
      <div className="absolute inset-y-0 left-0 w-1/3" onClick={() => setI((v) => Math.max(0, v - 1))} />
      <div className="absolute inset-y-0 right-0 w-2/3" onClick={() => (last ? onClose() : setI((v) => v + 1))} />
      <div className="absolute bottom-8 left-0 w-full text-white/80 text-sm z-[1]">{last ? '截图分享给 TA 📸 · 轻点退出' : '轻点继续 ›'}</div>
    </div>
  )
}

/** 散落的小星星装饰 */
function Stars() {
  const stars = [
    { t: '12%', l: '14%', s: 'text-2xl' },
    { t: '20%', l: '82%', s: 'text-lg' },
    { t: '46%', l: '8%', s: 'text-base' },
    { t: '52%', l: '88%', s: 'text-2xl' },
    { t: '74%', l: '16%', s: 'text-lg' },
    { t: '80%', l: '80%', s: 'text-base' },
  ]
  return (
    <>
      {stars.map((st, k) => (
        <span key={k} className={`absolute text-white/60 ${st.s} select-none`} style={{ top: st.t, left: st.l }} aria-hidden>
          ✦
        </span>
      ))}
    </>
  )
}
