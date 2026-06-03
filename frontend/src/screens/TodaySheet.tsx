import { useEffect, useState } from 'react'
import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
import { getSuggest } from '../api'
import type { Suggestion } from '../api'
import { getMyLocation } from '../lib/geo'

type Props = Readonly<{
  onClose: () => void
  onFocus: (poiId: string) => void
}>

/** 今天吃啥（底部抽屉）：真实 getSuggest + 想吃啥输入 + AI 建议卡 */
export default function SuggestSheet({ onClose, onFocus }: Props) {
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
      <h3 className="font-headline text-2xl flex items-center gap-1">
        今天吃啥 <Icon name="auto_awesome" className="text-accent text-xl" />
      </h3>

      <div className="flex gap-2 my-3">
        <input
          value={craving}
          onChange={(e) => setCraving(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask()
          }}
          placeholder="想吃点啥？清淡 / 辣 / 汤水…（可不填）"
          className="flex-1 min-w-0 rounded-full border-2 border-on-surface bg-white px-4 py-2.5 outline-none shadow-sticker-sm font-body text-sm placeholder:text-on-surface-variant/60"
        />
        <button
          onClick={ask}
          disabled={loading}
          className="shrink-0 bg-primary text-white rounded-full border-2 border-on-surface shadow-sticker px-5 font-headline font-bold press disabled:opacity-60"
        >
          {loading ? '想…' : '问问'}
        </button>
      </div>

      {loading && <SkeletonLines />}
      {err && <div className="text-primary font-bold text-sm bg-primary/10 border-2 border-primary/25 rounded-lg px-3 py-2">{err}</div>}

      {data &&
        !loading &&
        (data.empty ? (
          <div className="text-on-surface-variant text-sm py-6 text-center">{data.note}</div>
        ) : (
          <>
            {data.note && <p className="font-headline text-lg mb-3">{data.note}</p>}
            <div className="space-y-3">
              {data.picks.map((p) => (
                <button
                  key={p.poi_id}
                  onClick={() => {
                    if (p.has_coords) onFocus(p.poi_id)
                  }}
                  className="w-full text-left sticker p-4 relative press"
                >
                  <span
                    className={`absolute -top-2.5 left-3 px-2 py-0.5 rounded-full border-2 border-on-surface text-xs font-bold shadow-sticker-sm ${
                      p.kind === 'wish' ? 'bg-[#4f8aef] text-white' : 'bg-accent text-on-surface'
                    }`}
                  >
                    {p.kind === 'wish' ? '想去' : '想再来'}
                  </span>
                  <div className="pt-1">
                    <div className="font-headline text-xl">{p.name}</div>
                    <div className="text-sm text-on-surface-variant my-1">{p.reason}</div>
                    {p.has_coords && (
                      <span className="text-primary font-bold text-sm flex items-center gap-0.5">
                        地图上看 <Icon name="chevron_right" className="text-base" />
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={ask}
              disabled={loading}
              className="w-full mt-4 bg-white rounded-full border-2 border-on-surface shadow-sticker py-2.5 font-headline font-bold press flex items-center justify-center gap-1 disabled:opacity-60"
            >
              <Icon name="casino" className="text-primary" /> 换一批
            </button>
          </>
        ))}
    </SheetShell>
  )
}

function SkeletonLines() {
  return (
    <div className="space-y-2 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 rounded-xl bg-on-surface/5 border-2 border-on-surface/10 animate-pulse" />
      ))}
    </div>
  )
}
