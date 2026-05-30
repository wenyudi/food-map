import { useMemo, useState, type ReactNode } from 'react'
import type { Point } from '../api'
import { cleanTag } from '../lib/format'
import { useCountUp } from '../lib/useCountUp'

// 单个会滚动的数字（卡片切换时重挂载 → 重新从 0 滚）
function Stat({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const v = useCountUp(value)
  return <>{decimals ? v.toFixed(decimals) : Math.round(v)}</>
}

type Card = { theme: string; emoji: string; big: ReactNode; small: ReactNode }

function buildCards(points: Point[]): Card[] {
  const visits = points.flatMap(p => p.visits.map(v => ({ v, p })))
  if (visits.length === 0) return []

  const totalVisits = visits.length
  const totalStores = points.filter(p => p.visit_count > 0).length
  const totalAmount = visits.reduce((s, x) => s + Number(x.v.amount || 0), 0)
  const fulfilled = points.filter(p => p.wish && p.wish.status === 'visited').length
  const openWishes = points.filter(p => p.wish && p.wish.status === 'want').length

  const mostVisited = points.filter(p => p.visit_count > 0)
    .sort((a, b) => b.visit_count - a.visit_count)[0]
  const priciest = visits.filter(x => Number(x.v.per_person) > 0)
    .sort((a, b) => Number(b.v.per_person) - Number(a.v.per_person))[0]

  const tagCount: Record<string, number> = {}
  points.forEach(p => {
    if (p.visit_count > 0) {
      const t = cleanTag(p.tag, 1)
      if (t) tagCount[t] = (tagCount[t] || 0) + p.visit_count
    }
  })
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0])

  const dates = visits.map(x => x.v.date).filter(Boolean).sort()
  const fmt = (d: string) => d.slice(0, 7).replace('-', '.')
  const range = dates.length
    ? (fmt(dates[0]) === fmt(dates[dates.length - 1]) ? fmt(dates[0]) : `${fmt(dates[0])} – ${fmt(dates[dates.length - 1])}`)
    : ''

  const cards: Card[] = []
  cards.push({ theme: 'cover', emoji: '🍜', big: <>我们的<br />美食回忆</>, small: range })
  cards.push({
    theme: 'sum', emoji: '🥢',
    big: <>一起吃过<br /><span className="mr-num"><Stat value={totalVisits} /></span> 顿饭</>,
    small: <>走进 {totalStores} 家店 · 花了 ¥{Math.round(totalAmount)}</>,
  })
  if (mostVisited && mostVisited.visit_count >= 2) {
    cards.push({
      theme: 'fav', emoji: '❤️',
      big: <>最爱的一家<br />「{mostVisited.name}」</>,
      small: <>一去再去，<span className="mr-num"><Stat value={mostVisited.visit_count} /></span> 次</>,
    })
  }
  if (priciest) {
    cards.push({
      theme: 'pricey', emoji: '💸',
      big: <>最奢侈的一顿<br />「{priciest.p.name}」</>,
      small: <>人均 ¥<span className="mr-num"><Stat value={Number(priciest.v.per_person)} /></span></>,
    })
  }
  if (topTags.length) {
    cards.push({ theme: 'taste', emoji: '😋', big: <>你们的口味</>, small: topTags.join('  ·  ') })
  }
  if (fulfilled > 0 || openWishes > 0) {
    cards.push({
      theme: 'wish', emoji: '✨',
      big: <>种草兑现<br /><span className="mr-num"><Stat value={fulfilled} /></span> 家</>,
      small: openWishes > 0 ? <>还有 {openWishes} 家在清单上等你们</> : <>清单都清空了，厉害！</>,
    })
  }
  cards.push({ theme: 'end', emoji: '🗺️', big: <>故事还在继续</>, small: '继续点亮你们的美食地图' })
  return cards
}

export default function MemoryReport({ points, onClose }: { points: Point[]; onClose: () => void }) {
  const cards = useMemo(() => buildCards(points), [points])
  const [i, setI] = useState(0)

  if (cards.length === 0) {
    return (
      <div className="mr-overlay">
        <button className="mr-close" onClick={onClose}>✕</button>
        <div className="mr-card mr-cover">
          <div className="mr-emoji">🍜</div>
          <div className="mr-big">回忆还在路上</div>
          <div className="mr-small">先记几顿，再来翻翻你们的故事</div>
        </div>
      </div>
    )
  }

  const card = cards[i]
  const last = i >= cards.length - 1
  return (
    <div className="mr-overlay">
      <div className="mr-progress">
        {cards.map((_, idx) => <span key={idx} className={idx <= i ? 'on' : ''} />)}
      </div>
      <button className="mr-close" onClick={onClose}>✕</button>
      <div className={'mr-card mr-' + card.theme} key={i}>
        <div className="mr-emoji">{card.emoji}</div>
        <div className="mr-big">{card.big}</div>
        <div className="mr-small">{card.small}</div>
      </div>
      <div className="mr-tap mr-tap-left" onClick={() => setI(v => Math.max(0, v - 1))} />
      <div className="mr-tap mr-tap-right" onClick={() => (last ? onClose() : setI(v => v + 1))} />
      <div className="mr-hint">{last ? '截图分享给 TA 📸 · 轻点退出' : '轻点继续 ›'}</div>
    </div>
  )
}
