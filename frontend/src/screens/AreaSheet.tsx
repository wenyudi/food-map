import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
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
      <div className="flex flex-col items-center text-center">
        <div className="w-24 h-24 rounded-full bg-accent border-[3px] border-on-surface shadow-sticker flex items-center justify-center text-5xl mb-3">
          {t ? '🏆' : locked ? '🤍' : '📍'}
        </div>
        <h3 className="font-headline text-2xl">{t?.title ? `「${t.title}」` : area.name}</h3>
        <p className="text-on-surface-variant text-sm mt-1 mb-4">
          {t ? t.blurb : locked ? '这片区还没点亮，先去吃一家 🤍' : '称号生成中…'}
        </p>

        {/* 点亮进度：吃过(实) / 想去(虚) */}
        <div className="w-full">
          <div className="h-4 rounded-full border-2 border-on-surface bg-white overflow-hidden flex">
            {eaten > 0 && <span className="bg-primary h-full" style={{ flex: eaten }} />}
            {area.want.length > 0 && <span className="bg-accent/60 h-full" style={{ flex: area.want.length }} />}
          </div>
          <div className="flex justify-between text-sm font-bold mt-1.5">
            <span>
              {eaten}/{area.total} 已点亮 · {pct}%
            </span>
            {area.want.length > 0 && <span className="text-on-surface-variant">还有 {area.want.length} 家想去</span>}
          </div>
        </div>

        {(area.cuisines.length > 0 || area.flavors.length > 0) && (
          <div className="w-full border-t-2 border-dashed border-on-surface/20 mt-4 pt-3 text-sm">
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
        <div className="mt-4">
          <div className="flex items-center gap-1 font-bold mb-2">
            <Icon name="restaurant" className="text-primary" /> 吃过 {eaten} 家
          </div>
          {area.eaten.map((p) => (
            <button
              key={p.poi_id}
              onClick={() => onPickStore(p.poi_id)}
              className="w-full text-left sticker p-3 mb-2 flex items-center gap-3 press"
            >
              <span className="w-10 h-10 rounded-full border-2 border-on-surface bg-white flex items-center justify-center text-lg shrink-0">
                {p.emoji}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.name}</div>
                {cleanTag(p.tag, 1) && <div className="text-xs text-on-surface-variant">{cleanTag(p.tag, 1)}</div>}
              </div>
              {p.visit_count > 1 && (
                <span className="bg-primary text-white rounded-full border-2 border-on-surface px-2 py-0.5 text-xs font-bold shrink-0">
                  {p.visit_count}次
                </span>
              )}
              <Icon name="chevron_right" className="text-on-surface-variant shrink-0" />
            </button>
          ))}
        </div>
      )}

      {area.want.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-1 font-bold mb-2">❤️ 想去还没去 {area.want.length} 家</div>
          {area.want.map((p) => (
            <button
              key={p.poi_id}
              onClick={() => onPickStore(p.poi_id)}
              className="w-full text-left sticker p-3 mb-2 flex items-center gap-3 press"
            >
              <span className="w-10 h-10 rounded-full border-2 border-on-surface bg-white flex items-center justify-center text-lg shrink-0">
                ❤️
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{p.name}</div>
              </div>
              <Icon name="chevron_right" className="text-on-surface-variant shrink-0" />
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onReroll}
        disabled={rerolling}
        className="w-full mt-2 bg-white rounded-full border-2 border-on-surface shadow-sticker py-2.5 font-headline font-bold press disabled:opacity-60"
      >
        {rerolling ? '重取中…' : '🎲 换个称号'}
      </button>
    </SheetShell>
  )
}
