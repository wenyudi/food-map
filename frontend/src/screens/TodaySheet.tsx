import { useEffect, useState } from 'react'
import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import { getSuggest } from '../api'
import type { Suggestion } from '../api'
import { getMyLocation } from '../lib/geo'

type Props = Readonly<{
  onClose: () => void
  onFocus: (poiId: string) => void
  /** 想问点别的：切到问地图 */
  onAsk?: () => void
}>

/** 今天吃啥（底部抽屉）：真实 getSuggest + 想吃啥输入 + AI 建议卡 */
export default function SuggestSheet({ onClose, onFocus, onAsk }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Suggestion | null>(null)
  const [craving, setCraving] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function ask() {
    setLoading(true)
    setErr(null)
    try {
      const loc = await getMyLocation()
      const locStr = loc ? `${loc.lng},${loc.lat}` : undefined
      setData(await getSuggest(locStr, craving.trim() || undefined))
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '没问出来，再试一次')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    ask()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-2xl font-bold tracking-tight flex items-center gap-1.5 pr-10">
        今天吃啥 <Icon name="auto_awesome" filled className="text-accent text-[22px]" />
      </h3>
      <p className="text-sm text-on-surface-variant mt-0.5">按口味、时段和位置帮你拍板</p>

      <div className="flex gap-2 my-4">
        <input
          value={craving}
          onChange={(e) => setCraving(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask()
          }}
          placeholder="想吃点啥？清淡 / 辣 / 汤水…（可不填）"
          className="field flex-1 min-w-0 !rounded-full !py-2.5 text-sm"
        />
        <button
          onClick={ask}
          disabled={loading}
          className="shrink-0 bg-primary text-white rounded-full shadow-glow px-5 font-semibold press disabled:opacity-60 disabled:shadow-none"
        >
          {loading ? '想…' : '问问'}
        </button>
      </div>

      {loading && <SkeletonLines />}
      {err && <div className="text-primary-dark text-sm bg-primary-soft rounded-2xl px-3.5 py-2.5 animate-shake">{err}</div>}

      {data &&
        !loading &&
        (data.empty ? (
          <div className="text-on-surface-variant text-sm py-8 text-center animate-fade-up">{data.note}</div>
        ) : (
          <>
            {data.note && <p className="text-lg font-semibold mb-3 animate-fade-up">{data.note}</p>}
            <div className="space-y-3">
              {data.picks.map((p, i) => (
                <button
                  key={p.poi_id}
                  onClick={() => {
                    if (p.has_coords) onFocus(p.poi_id)
                  }}
                  className="stagger w-full text-left card p-4 press"
                  style={{ '--i': i + 1 } as React.CSSProperties}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold mb-1.5 ${
                          p.kind === 'wish' ? 'bg-rose-soft text-rose-ink' : 'bg-primary-soft text-primary-dark'
                        }`}
                      >
                        {p.kind === 'wish' ? '🌱 想去' : '❤️ 想再来'}
                      </span>
                      <div className="text-[18px] font-bold tracking-tight">{p.name}</div>
                    </div>
                    {p.has_coords && (
                      <span className="shrink-0 w-9 h-9 rounded-full bg-primary-soft text-primary flex items-center justify-center mt-1">
                        <Icon name="near_me" filled className="text-[18px]" />
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-on-surface-variant mt-1 leading-relaxed">{p.reason}</div>
                  {p.open_now === false && <div className="text-xs font-medium text-on-surface-variant mt-2">🌙 现在可能已打烊</div>}
                  {p.open_now === true && (
                    <div className="text-xs font-semibold text-sage-ink mt-2 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-sage" /> 现在营业中
                    </div>
                  )}
                </button>
              ))}
            </div>
            <Button variant="white" full className="mt-4 group" onClick={ask} disabled={loading}>
              <Icon name="casino" className="text-primary transition-transform duration-500 ease-spring group-active:rotate-180" /> 换一批
            </Button>
          </>
        ))}
      {onAsk && (
        <button onClick={onAsk} className="w-full mt-2 py-2 text-sm font-medium text-on-surface-variant flex items-center justify-center gap-1 press-sm">
          <Icon name="forum" className="text-[17px]" /> 想问点别的？问地图
        </button>
      )}
    </SheetShell>
  )
}

function SkeletonLines() {
  return (
    <div className="space-y-3 py-1">
      <div className="skeleton h-5 w-1/2" />
      {[0, 1].map((i) => (
        <div key={i} className="card p-4 space-y-2.5">
          <div className="skeleton h-3.5 w-14 !rounded-full" />
          <div className="skeleton h-5 w-2/5" />
          <div className="skeleton h-3 w-4/5" />
        </div>
      ))}
    </div>
  )
}
