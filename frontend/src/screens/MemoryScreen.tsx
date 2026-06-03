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

function Stat({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const v = useCountUp(value)
  return <>{decimals ? v.toFixed(decimals) : Math.round(v)}</>
}

type Card = { theme: string; emoji: string; big: ReactNode; small: ReactNode }

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
  cards.push({ theme: 'cover', emoji: '🍜', big: <>我们的<br />美食回忆</>, small: range })
  cards.push({
    theme: 'sum',
    emoji: '🥢',
    big: (
      <>
        一起吃过
        <br />
        <span className="font-num text-7xl">
          <Stat value={totalVisits} />
        </span>{' '}
        顿饭
      </>
    ),
    small: (
      <>
        走进 {totalStores} 家店 · 花了 ¥{Math.round(totalAmount)}
      </>
    ),
  })
  if (mostVisited && mostVisited.visit_count >= 2) {
    cards.push({
      theme: 'fav',
      emoji: '❤️',
      big: <>最爱的一家<br />「{mostVisited.name}」</>,
      small: (
        <>
          一去再去，<Stat value={mostVisited.visit_count} /> 次
        </>
      ),
    })
  }
  if (priciest) {
    cards.push({
      theme: 'pricey',
      emoji: '💸',
      big: <>最奢侈的一顿<br />「{priciest.p.name}」</>,
      small: (
        <>
          人均 ¥<Stat value={Number(priciest.v.per_person)} />
        </>
      ),
    })
  }
  if (topCuisines.length || topFlavors.length) {
    cards.push({
      theme: 'taste',
      emoji: '😋',
      big: <>你们的口味</>,
      small: (
        <>
          {topCuisines.length ? (
            <>
              常吃 <b>{topCuisines.join(' / ')}</b>
            </>
          ) : null}
          {topCuisines.length && topFlavors.length ? <br /> : null}
          {topFlavors.length ? (
            <>
              偏爱 <b>{topFlavors.join(' / ')}</b>
            </>
          ) : null}
        </>
      ),
    })
  }
  if (topOcc && topOcc[1] >= 2) {
    cards.push({
      theme: 'occ',
      emoji: '💞',
      big: <>最多是<br />「{topOcc[0]}」饭</>,
      small: (
        <>
          一起吃了 <Stat value={topOcc[1]} /> 顿
        </>
      ),
    })
  }
  if (fulfilled > 0 || openWishes > 0) {
    cards.push({
      theme: 'wish',
      emoji: '✨',
      big: (
        <>
          种草兑现
          <br />
          <Stat value={fulfilled} /> 家
        </>
      ),
      small: openWishes > 0 ? <>还有 {openWishes} 家在清单上等你们</> : <>清单都清空了，厉害！</>,
    })
  }
  cards.push({ theme: 'end', emoji: '🗺️', big: <>故事还在继续</>, small: '继续点亮你们的美食地图' })
  return cards
}

/** 美食回忆报告：全屏可滑动卡片（暖橙渐变） */
export default function MemoryScreen({ points, onClose }: MemoryScreenProps) {
  const cards = useMemo(() => buildCards(points), [points])
  const [i, setI] = useState(0)

  const shell =
    'fixed inset-0 z-[160] bg-gradient-to-b from-primary via-[#f37a5a] to-[#ffb38a] flex flex-col items-center justify-center text-white text-center px-8'

  if (cards.length === 0) {
    return (
      <div className={shell}>
        <button onClick={onClose} className="absolute top-5 right-5 w-10 h-10 rounded-full border-2 border-white/70 flex items-center justify-center">
          <Icon name="close" />
        </button>
        <div className="text-6xl mb-4">🍜</div>
        <div className="font-headline text-3xl mb-2">回忆还在路上</div>
        <div className="text-white/90">先记几顿，再来翻翻你们的故事</div>
      </div>
    )
  }

  const card = cards[i]
  const last = i >= cards.length - 1
  return (
    <div className={shell}>
      {/* 进度 */}
      <div className="absolute top-4 left-0 w-full px-5 flex gap-1.5">
        {cards.map((_, idx) => (
          <span key={idx} className={`flex-1 h-1 rounded-full ${idx <= i ? 'bg-white' : 'bg-white/30'}`} />
        ))}
      </div>
      <button onClick={onClose} className="absolute top-8 right-5 z-10 w-10 h-10 rounded-full border-2 border-white/70 flex items-center justify-center">
        <Icon name="close" />
      </button>

      <div key={i} className="animate-pop flex flex-col items-center">
        <div className="text-6xl mb-5">{card.emoji}</div>
        <div className="font-headline text-3xl leading-snug mb-4">{card.big}</div>
        <div className="text-white/95 text-lg max-w-[300px]">{card.small}</div>
      </div>

      {/* 点击区 */}
      <div className="absolute inset-y-0 left-0 w-1/3" onClick={() => setI((v) => Math.max(0, v - 1))} />
      <div className="absolute inset-y-0 right-0 w-2/3" onClick={() => (last ? onClose() : setI((v) => v + 1))} />
      <div className="absolute bottom-8 left-0 w-full text-white/70 text-sm">{last ? '截图分享给 TA 📸 · 轻点退出' : '轻点继续 ›'}</div>
    </div>
  )
}
