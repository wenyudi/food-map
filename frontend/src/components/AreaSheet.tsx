import type { Area } from '../lib/areas'
import type { AreaTitle } from '../api'
import { cleanTag } from '../lib/format'

export default function AreaSheet({
  area, titles, rerolling, onReroll, onClose, onPickStore,
}: {
  area: Area
  titles: Record<string, AreaTitle>
  rerolling: boolean
  onReroll: () => void
  onClose: () => void
  onPickStore: (poiId: string) => void
}) {
  const t = titles[area.key]
  const eaten = area.eaten.length
  const pct = Math.round(area.rate * 100)
  const locked = eaten === 0  // 纯想去片区：后端不取称号

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet area-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />

        {/* AI 称号头 */}
        <div className="as-title-head">
          <div className="as-badge">{t ? '🏆' : locked ? '🤍' : '📍'}</div>
          <div className="as-title">{t?.title || area.name}</div>
          <div className={'as-blurb' + (t ? '' : ' dim')}>
            {t ? t.blurb : locked ? '这片区还没点亮，先去吃一家 🤍' : '称号生成中…'}
          </div>
        </div>

        {/* 点亮进度：吃过(实) / 想去(虚) */}
        <div className="as-progress">
          <div className="as-bar">
            {eaten > 0 && <span className="as-eaten" style={{ flex: eaten }} />}
            {area.want.length > 0 && <span className="as-want" style={{ flex: area.want.length }} />}
          </div>
          <div className="as-legend">
            <b>{eaten}/{area.total}</b> 已点亮 · {pct}%
            {area.want.length > 0 && ` · 还有 ${area.want.length} 家想去`}
          </div>
        </div>

        {(area.cuisines.length > 0 || area.flavors.length > 0) && (
          <div className="as-taste">
            {area.cuisines.length > 0 && <>常吃 <b>{area.cuisines.join(' / ')}</b></>}
            {area.cuisines.length > 0 && area.flavors.length > 0 && ' · '}
            {area.flavors.length > 0 && <>偏爱 <b>{area.flavors.join(' / ')}</b></>}
          </div>
        )}

        {/* 吃过 */}
        {eaten > 0 && (
          <div className="as-group">
            <div className="as-group-t">吃过 {eaten} 家</div>
            {area.eaten.map(p => (
              <button key={p.poi_id} className="as-store" onClick={() => onPickStore(p.poi_id)}>
                <span className="as-emoji">{p.emoji}</span>
                <span className="as-name">{p.name}</span>
                {p.visit_count > 1 && <span className="as-tag">{p.visit_count}次</span>}
                {cleanTag(p.tag, 1) && <span className="as-cui">{cleanTag(p.tag, 1)}</span>}
                <span className="as-go">›</span>
              </button>
            ))}
          </div>
        )}

        {/* 想去 */}
        {area.want.length > 0 && (
          <div className="as-group">
            <div className="as-group-t">想去还没去 {area.want.length} 家</div>
            {area.want.map(p => (
              <button key={p.poi_id} className="as-store want" onClick={() => onPickStore(p.poi_id)}>
                <span className="as-emoji">❤️</span>
                <span className="as-name">{p.name}</span>
                <span className="as-go">›</span>
              </button>
            ))}
          </div>
        )}

        <button className="ghost-btn" onClick={onReroll} disabled={rerolling}>
          {rerolling ? '重取中…' : '🎲 换个称号'}
        </button>
      </div>
    </div>
  )
}
