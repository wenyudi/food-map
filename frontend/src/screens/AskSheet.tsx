import { useState } from 'react'
import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
import { askMap } from '../api'

const EXAMPLES = ['还有几家种草没去？', '最贵的一顿是哪家？', '想吃清淡的，之前去过哪些？', '哪家店去得最多？']

type AskSheetProps = Readonly<{ onClose: () => void }>

/** 问地图（底部抽屉）：真实 askMap 自然语言问自己的记录 */
export default function AskSheet({ onClose }: AskSheetProps) {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function ask(question?: string) {
    const qq = (question ?? q).trim()
    if (!qq) return
    setQ(qq)
    setLoading(true)
    setErr(null)
    setAnswer('')
    try {
      const r = await askMap(qq)
      setAnswer(r.answer)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '没答上来，再试一次')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SheetShell onClose={onClose}>
      <h3 className="font-headline text-2xl flex items-center gap-2">
        <span className="w-9 h-9 rounded-full bg-primary text-white border-2 border-on-surface flex items-center justify-center">
          <Icon name="forum" className="text-lg" />
        </span>
        问地图
      </h3>

      <div className="flex gap-2 my-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') ask()
          }}
          autoFocus
          placeholder="比如：还有几家种草没去？"
          className="flex-1 min-w-0 rounded-full border-2 border-on-surface bg-white px-4 py-2.5 outline-none shadow-sticker-sm font-body text-sm placeholder:text-on-surface-variant/60"
        />
        <button
          onClick={() => ask()}
          disabled={loading || !q.trim()}
          className="shrink-0 w-11 bg-primary text-white rounded-full border-2 border-on-surface shadow-sticker flex items-center justify-center press disabled:opacity-60"
        >
          <Icon name="send" />
        </button>
      </div>

      {!answer && !loading && !err && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => ask(e)}
              className="bg-white rounded-full border-2 border-on-surface shadow-sticker-sm px-3 py-1.5 text-sm font-bold press-sm"
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="space-y-1.5 py-2">
          <div className="h-3 bg-on-surface/10 rounded animate-pulse" />
          <div className="h-3 w-4/5 bg-on-surface/10 rounded animate-pulse" />
        </div>
      )}
      {err && <div className="text-primary font-bold text-sm bg-primary/10 border-2 border-primary/25 rounded-lg px-3 py-2">{err}</div>}
      {answer && (
        <div className="sticker p-4 mt-1">
          <div className="flex items-center gap-1 text-primary font-bold text-sm mb-2">
            <Icon name="auto_awesome" className="text-accent" /> AI 食探
          </div>
          <p className="text-on-surface leading-relaxed whitespace-pre-wrap">{answer}</p>
        </div>
      )}
    </SheetShell>
  )
}
