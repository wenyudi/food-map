import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import Stamp from '../ui/Stamp'
import type { Area } from '../lib/areas'
import type { AreaTitle } from '../api'
import { cleanTag } from '../lib/format'

type AreaSheetProps = Readonly<{
  area: Area
  titles: Record<string, AreaTitle>
  rerolling: boolean
  onReroll: () => void
  onClose: () => void
  onPickStore: (poiId: string) => void
}>

/** 片区版图（底部抽屉）：AI 称号 + 点亮进度（吃过实/想去虚）+ 店铺列表 */
export default function AreaSheet({ area, titles, rerolling, onReroll, onClose, onPickStore }: AreaSheetProps) {
  const t = titles[area.key]
  const eaten = area.eaten.length
  const pct = Math.round(area.rate * 100)
  const locked = eaten === 0

  return (
    <SheetShell onClose={onClose}>
      <div className="flex flex-col items-center text-center pt-1">
        <div className="relative w-24 h-24 rounded-full bg-surface-2 flex items-center justify-center text-[44px] mb-3">
          {t ? '🏆' : locked ? '🌱' : '📍'}
          {eaten > 0 && (
            <span className="absolute -right-5 -bottom-1">
              <Stamp text="点亮" size={52} index={2} />
            </span>
          )}
        </div>
        <h3 key={t?.title} className="text-2xl font-bold tracking-tight animate-fade-up">{t?.title ? `「${t.title}」` : area.name}</h3>
        {t?.title && <p className="text-xs text-on-surface-variant mt-0.5">{area.name}</p>}
        <p className="text-on-surface-variant text-sm mt-1.5 mb-5 text-balance">
          {t ? t.blurb : locked ? '这片区还没点亮，先去吃一家' : '称号生成中…'}
        </p>

        {/* 点亮进度：吃过(实) / 想去(浅) —— 打开时从 0 长出来 */}
        <div className="w-full">
          <div className="h-3 rounded-full bg-surface-2 overflow-hidden flex">
            {eaten > 0 && <span className="h-full bg-primary rounded-full origin-left animate-[grow_.9s_cubic-bezier(.16,1,.3,1)_.15s_backwards]" style={{ flex: eaten }} />}
            {area.want.length > 0 && <span className="h-full bg-accent/50 origin-left animate-[grow_.9s_cubic-bezier(.16,1,.3,1)_.35s_backwards]" style={{ flex: area.want.length }} />}
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="font-semibold">
              <span className="font-num">{eaten}/{area.total}</span> 已点亮 · <span className="font-num text-primary">{pct}%</span>
            </span>
            {area.want.length > 0 && <span className="text-on-surface-variant">还有 {area.want.length} 家想去</span>}
          </div>
        </div>

        {(area.cuisines.length > 0 || area.flavors.length > 0) && (
          <div className="w-full mt-4 rounded-2xl bg-surface-2/70 px-4 py-3 text-sm">
            {area.cuisines.length > 0 && (
              <>
                常吃 <b>{area.cuisines.join(' / ')}</b>
              </>
            )}
            {area.cuisines.length > 0 && area.flavors.length > 0 && ' · '}
            {area.flavors.length > 0 && (
              <>
                偏爱 <b>{area.flavors.join(' / ')}</b>
              </>
            )}
          </div>
        )}
      </div>

      {eaten > 0 && (
        <div className="mt-6">
          <div className="section-label mb-2.5 px-0.5">吃过 {eaten} 家</div>
          <div className="card overflow-hidden">
            {area.eaten.map((p, i) => (
              <StoreRow key={p.poi_id} i={i} emoji={p.emoji} name={p.name} sub={cleanTag(p.tag, 1)} badge={p.visit_count > 1 ? `${p.visit_count}次` : undefined} onClick={() => onPickStore(p.poi_id)} />
            ))}
          </div>
        </div>
      )}

      {area.want.length > 0 && (
        <div className="mt-5">
          <div className="section-label mb-2.5 px-0.5">想去还没去 {area.want.length} 家</div>
          <div className="card overflow-hidden">
            {area.want.map((p, i) => (
              <StoreRow key={p.poi_id} i={i + eaten} emoji="🌱" name={p.name} onClick={() => onPickStore(p.poi_id)} />
            ))}
          </div>
        </div>
      )}

      {/* 还没点亮的片区没有称号，不给换 */}
      {!locked && (
        <Button variant="white" full className="mt-5" loading={rerolling} onClick={onReroll}>
          {rerolling ? '重取中…' : '🎲 换个称号'}
        </Button>
      )}
    </SheetShell>
  )
}

function StoreRow({ i, emoji, name, sub, badge, onClick }: { i: number; emoji: string; name: string; sub?: string; badge?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="stagger w-full text-left px-3.5 py-3 flex items-center gap-3 transition-colors active:bg-surface-2 [&+&]:border-t [&+&]:border-line"
      style={{ '--i': i } as React.CSSProperties}
    >
      <span className="w-10 h-10 rounded-2xl bg-surface-2 flex items-center justify-center text-lg shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{name}</div>
        {sub && <div className="text-xs text-on-surface-variant">{sub}</div>}
      </div>
      {badge && <span className="bg-primary-soft text-primary-dark rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 font-num">{badge}</span>}
      <Icon name="chevron_right" className="text-on-surface-variant/60 shrink-0" />
    </button>
  )
}
