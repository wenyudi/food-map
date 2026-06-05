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

// 每张卡：emoji 主图 + 小标签 + 大数值 + 详情 + 可选金色 pill + 该章节的极光辉光配色
type Card = {
  emoji: string
  label?: ReactNode
  value: ReactNode
  detail?: ReactNode
  pills?: { text: string }[]
  glow: [string, string] // [近暖辉光, 远深辉光]
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
  const range = dates.length ? (fmt(dates[0]) === fmt(dates[dates.length - 1]) ? fmt(dates[0]) : `${fmt(dates[0])} — ${fmt(dates[dates.length - 1])}`) : ''

  const cards: Card[] = []
  cards.push({
    emoji: '🍜',
    value: (
      <>
        我们的
        <br />
        美食回忆
      </>
    ),
    detail: range || '一起点亮的食光',
    glow: ['#F4B740', '#7A4A1E'],
  })
  cards.push({
    emoji: '🥢',
    label: '这一年一起吃过',
    value: (
      <>
        <Num value={totalVisits} /> 顿饭
      </>
    ),
    detail: (
      <>
        走进 <Num value={totalStores} /> 家店 · 一起花了 ¥<Num value={Math.round(totalAmount)} />
      </>
    ),
    pills: [{ text: '⭐ 每次都解馋' }, { text: '❤️ 想吃一辈子' }],
    glow: ['#F0A24B', '#8A2E22'],
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
      glow: ['#E96D8A', '#7E2746'],
    })
  }
  if (priciest) {
    cards.push({
      emoji: '🥂',
      label: '最奢侈的一顿',
      value: <>「{priciest.p.name}」</>,
      detail: (
        <>
          人均 ¥<Num value={Number(priciest.v.per_person)} />
        </>
      ),
      glow: ['#F2C75B', '#8A5A1E'],
    })
  }
  if (topCuisines.length || topFlavors.length) {
    cards.push({
      emoji: '😋',
      label: '你们的口味',
      value: topCuisines.length ? <>{topCuisines.join(' · ')}</> : <>百味皆尝</>,
      detail: topFlavors.length ? <>偏爱 {topFlavors.join(' · ')}</> : <>什么都爱试试</>,
      glow: ['#5FB8A6', '#1E5E54'],
    })
  }
  if (topOcc && topOcc[1] >= 2) {
    cards.push({
      emoji: '💞',
      label: '最多的相聚',
      value: <>「{topOcc[0]}」饭</>,
      detail: (
        <>
          一起吃了 <Num value={topOcc[1]} /> 顿
        </>
      ),
      glow: ['#B98BE6', '#4B3A86'],
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
      glow: ['#A6D177', '#3E6B33'],
    })
  }
  cards.push({ emoji: '🗺️', value: <>故事还在继续</>, detail: '继续点亮你们的美食地图', glow: ['#F4B740', '#7A4A1E'] })
  return cards
}

// 散落金粒（替代卡通星星）：位置 / 大小 / 闪烁延时各异
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
          className={`pointer-events-none absolute z-0 select-none text-[#F4D58A] animate-mem-twinkle ${s.s}`}
          style={{ top: s.t, left: s.l, animationDelay: s.d }}
        >
          ✦
        </span>
      ))}
    </>
  )
}

/** 年度回忆报告 · 暗色编辑杂志风：暖黑极光 + 毛玻璃 + 金色衬线大字 + 全屏轻点翻页 */
export default function MemoryScreen({ points, onClose }: MemoryScreenProps) {
  const cards = useMemo(() => buildCards(points), [points])
  const [i, setI] = useState(0)

  const shell = 'fixed inset-0 z-[1300] flex items-center justify-center overflow-hidden px-6 text-center'
  const baseBg = 'radial-gradient(135% 120% at 50% 0%, #211608 0%, #100c0a 52%, #0a0807 100%)'

  if (cards.length === 0) {
    return (
      <div className={shell} style={{ background: baseBg }}>
        <Sparks />
        <button
          onClick={onClose}
          className="absolute right-4 top-[max(0.8rem,env(safe-area-inset-top))] z-30 grid h-10 w-10 place-items-center rounded-full border border-white/25 text-white/80 backdrop-blur-sm transition active:scale-95"
        >
          <Icon name="close" />
        </button>
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative mb-7 text-6xl animate-mem-float [filter:drop-shadow(0_8px_22px_rgba(0,0,0,.5))]">🍜</div>
          <div className="font-serifcjk text-3xl font-bold text-[#FAF4E8]">回忆还在路上</div>
          <div className="mt-2 font-body text-sm text-white/55">先记几顿，再来翻翻你们的故事</div>
        </div>
      </div>
    )
  }

  const card = cards[i]
  const last = i >= cards.length - 1
  const [glowA, glowB] = card.glow

  return (
    <div className={shell} style={{ background: baseBg }}>
      {/* 极光辉光（随章节换色） */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-1/4 -top-1/4 h-[78vh] w-[78vh] rounded-full opacity-60 blur-[90px] animate-mem-aurora"
        style={{ background: `radial-gradient(circle, ${glowA}, transparent 64%)` }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-1/4 -right-1/4 h-[72vh] w-[72vh] rounded-full opacity-50 blur-[100px] animate-mem-aurora [animation-delay:-7s]"
        style={{ background: `radial-gradient(circle, ${glowB}, transparent 66%)` }}
      />
      {/* 暗角，把视线收向中心、压住边缘辉光 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'radial-gradient(125% 95% at 50% 32%, transparent 38%, rgba(0,0,0,.6) 100%)' }}
      />
      <Sparks />

      {/* 进度条 */}
      <div className="absolute inset-x-0 top-0 z-30 flex gap-1.5 px-4 pt-[max(0.85rem,env(safe-area-inset-top))]">
        {cards.map((_, idx) => (
          <span key={idx} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/15">
            <span
              className="block h-full rounded-full bg-[#F4D58A] transition-all duration-300"
              style={{ width: idx <= i ? '100%' : '0%' }}
            />
          </span>
        ))}
      </div>
      <button
        onClick={onClose}
        className="absolute right-4 top-[max(1.4rem,calc(env(safe-area-inset-top)+0.6rem))] z-30 grid h-10 w-10 place-items-center rounded-full border border-white/25 text-white/80 backdrop-blur-sm transition active:scale-95"
      >
        <Icon name="close" />
      </button>

      {/* 内容：毛玻璃卡 */}
      <div className="relative z-10 w-[86%] max-w-sm">
        <div
          key={i}
          className="animate-mem-in rounded-[2rem] border border-white/10 bg-white/[0.045] px-7 py-11 shadow-[0_24px_70px_-24px_rgba(0,0,0,.75)] backdrop-blur-md"
        >
          {/* emoji 主图 + 金色辉光底 */}
          <div className="relative mx-auto mb-7 w-fit">
            <div
              aria-hidden
              className="absolute inset-0 -m-5 rounded-full opacity-70 blur-2xl"
              style={{ background: `radial-gradient(circle, ${glowA}77, transparent 70%)` }}
            />
            <div className="relative text-[3.25rem] leading-none animate-mem-float [filter:drop-shadow(0_6px_16px_rgba(0,0,0,.45))]">
              {card.emoji}
            </div>
          </div>

          {/* 小标签：金色 + 细线 + 字距 */}
          {card.label && (
            <div className="mb-3.5 flex items-center justify-center gap-2.5 text-[#F0D38C]">
              <span className="h-px w-5 bg-[#F0D38C]/45" />
              <span className="font-body text-[11px] font-semibold tracking-[0.32em] pl-[0.32em]">{card.label}</span>
              <span className="h-px w-5 bg-[#F0D38C]/45" />
            </div>
          )}

          {/* 大数值：中文衬线奶白，数字 Playfair 金色 + 辉光 */}
          <div className="text-balance break-words font-serifcjk text-[2.55rem] font-medium leading-[1.14] text-[#FAF4E8] [&_.font-num]:font-playfair [&_.font-num]:text-[3.6rem] [&_.font-num]:font-semibold [&_.font-num]:text-[#F6C45A] [&_.font-num]:[text-shadow:0_0_30px_rgba(246,196,90,.45)]">
            {card.value}
          </div>

          {/* 详情：细金分割线 + 浅奶白，内嵌数字也走金色 Playfair */}
          {card.detail && (
            <>
              <span className="mx-auto my-5 block h-px w-12 bg-white/15" />
              <div className="font-body text-[15px] leading-relaxed text-white/70 [&_.font-num]:font-playfair [&_.font-num]:font-semibold [&_.font-num]:text-[#F6C45A]">
                {card.detail}
              </div>
            </>
          )}

          {/* 金边玻璃 pill */}
          {card.pills && (
            <div className="mt-6 flex flex-wrap justify-center gap-2.5">
              {card.pills.map((p) => (
                <span
                  key={p.text}
                  className="rounded-full border border-[#F0D38C]/35 bg-[#F0D38C]/10 px-3.5 py-1.5 font-body text-xs font-medium tracking-wide text-[#F4E3B8] backdrop-blur-sm"
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
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.6rem,env(safe-area-inset-bottom))] z-30 font-body text-[13px] tracking-wide text-white/45">
        {last ? '截图分享给 TA 📸 · 轻点退出' : '轻点继续 ›'}
      </div>
    </div>
  )
}
