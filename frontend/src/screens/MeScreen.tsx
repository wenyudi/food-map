import { useEffect, useState } from 'react'
import Icon from '../ui/Icon'
import SheetShell from '../ui/SheetShell'
import Button from '../ui/Button'
import MemoryScreen from './MemoryScreen'
import CircleSheet from './CircleSheet'
import Wordmark from '../ui/Wordmark'
import Presence from '../ui/Presence'
import MonthlySummary from './MonthlySummary'
import { exportData, resetMine, changePassword } from '../api'
import type { MeInfo, Point } from '../api'
import { deriveStats } from '../lib/stats'
import { useCountUp } from '../lib/useCountUp'
import { inputClass } from '../lib/format'

type MeScreenProps = Readonly<{
  me: MeInfo
  points: Point[]
  circleName: string
  circleCount: number
  onLogout: () => void
  onCircleChanged: () => void
  autoOpenCircle?: boolean
  onCircleOpened?: () => void
}>

type Sheet = 'circle' | 'pw' | null

export default function MeScreen({ me, points, circleName, circleCount, onLogout, onCircleChanged, autoOpenCircle, onCircleOpened }: MeScreenProps) {
  const stats = deriveStats(points)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  // 从空状态「拉饭搭子进圈」跳进来时，自动展开圈子管理（直达邀请）
  useEffect(() => {
    if (autoOpenCircle) {
      setSheet('circle')
      onCircleOpened?.()
    }
  }, [autoOpenCircle, onCircleOpened])

  async function doExport() {
    setExporting(true)
    setExportMsg(null)
    try {
      const data = await exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chiledme-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportMsg(`已导出 ${data?.counts?.visits ?? 0} 条吃过、${data?.counts?.wishes ?? 0} 条想去`)
    } catch {
      setExportMsg('导出失败，稍后再试')
    } finally {
      setExporting(false)
    }
  }

  async function doReset() {
    setResetting(true)
    setResetMsg(null)
    try {
      const r = await resetMine()
      setResetMsg(`已清空你记的 ${r.visits} 条吃过、${r.wishes} 条想去`)
      setConfirmReset(false)
      onCircleChanged()  // 全局刷新地图/列表/统计，别让 TTL 内还显示已清的记录
    } catch (e: any) {
      setResetMsg(e?.response?.data?.detail || '清空失败')
    } finally {
      setResetting(false)
    }
  }

  const initial = (me.nickname || me.username || '?').slice(0, 1).toUpperCase()

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)_+_1.5rem)] pb-tabbar space-y-4">
        {/* 资料头 */}
        <section className="flex items-center gap-4 px-1 stagger" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="relative w-[72px] h-[72px] rounded-[26px] bg-gradient-to-br from-accent to-primary shadow-glow flex items-center justify-center font-display text-[34px] text-white shrink-0">
            {initial}
          </div>
          <div className="flex flex-col gap-1.5 min-w-0">
            <h2 className="text-[24px] font-bold tracking-tight leading-tight truncate">{me.nickname || me.username}</h2>
            <button
              onClick={() => setSheet('circle')}
              className="flex items-center gap-1 bg-white shadow-soft ring-1 ring-line rounded-full pl-2.5 pr-1.5 py-1 text-[13px] font-medium w-fit max-w-full press-sm"
            >
              <Icon name="group" filled className="text-[16px] text-primary shrink-0" />
              <span className="truncate">{circleName || '我的圈子'}</span>
              <Icon name="unfold_more" className="text-[16px] text-on-surface-variant shrink-0" />
            </button>
          </div>
        </section>

        {/* 三格数据 */}
        <section className="card grid grid-cols-3 py-4 stagger" style={{ '--i': 1 } as React.CSSProperties}>
          <MiniStat value={stats.total_visits} label="顿饭" />
          <MiniStat value={stats.total_stores_visited} label="家店" />
          <MiniStat value={stats.total_wishes_open} label="想去" />
        </section>

        {/* 本月小结 + AI 回忆 */}
        <div className="stagger" style={{ '--i': 2 } as React.CSSProperties}>
          <MonthlySummary points={points} refreshKey={0} />
        </div>

        {/* 美食回忆报告 */}
        <button
          onClick={() => setMemoryOpen(true)}
          className="stagger relative w-full overflow-hidden text-left rounded-3xl bg-gradient-to-br from-primary via-[#f27c5c] to-[#f6a467] shadow-glow p-5 press"
          style={{ '--i': 3 } as React.CSSProperties}
        >
          <span className="absolute inset-0 grain opacity-60" aria-hidden />
          <span className="absolute -right-6 -top-8 w-36 h-36 rounded-full bg-white/15 blur-2xl" aria-hidden />
          {/* 漂浮的美食 */}
          <span className="absolute right-5 top-3 text-[34px] animate-bob" aria-hidden>🍜</span>
          <span className="absolute right-20 top-11 text-[22px] animate-bob [animation-delay:-1.2s]" aria-hidden>🍡</span>
          <span className="absolute right-9 bottom-4 text-[26px] animate-bob [animation-delay:-.6s]" aria-hidden>🥟</span>
          <div className="relative">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
              <Icon name="auto_stories" className="text-[14px]" /> 年度回忆
            </span>
            <h4 className="font-display text-[26px] text-white mt-2.5 leading-tight">美食回忆报告</h4>
            <p className="text-white/85 text-sm mt-1 flex items-center gap-1">
              翻翻这个圈子的食光故事
              <Icon name="arrow_forward" className="text-[16px]" />
            </p>
          </div>
        </button>

        {/* 设置列表 */}
        <section className="card overflow-hidden stagger" style={{ '--i': 4 } as React.CSSProperties}>
          <Row icon="diversity_3" label="我的圈子" hint={circleCount > 1 ? `${circleCount} 个` : undefined} onClick={() => setSheet('circle')} />
          <Row icon="cloud_download" label={exporting ? '导出中…' : '数据备份与导出'} onClick={doExport} />
          <Row icon="lock_reset" label="修改密码" onClick={() => setSheet('pw')} />
        </section>
        {exportMsg && <p className="text-center text-sm text-on-surface-variant animate-fade-up">{exportMsg}</p>}

        <button
          onClick={() => setConfirmLogout(true)}
          className="stagger card w-full py-3.5 text-[15px] font-medium text-center text-on-surface press"
          style={{ '--i': 5 } as React.CSSProperties}
        >
          退出登录
        </button>

        {/* 清空 + 版本 */}
        <div className="pt-1 pb-2 flex flex-col items-center gap-3">
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="text-xs text-on-surface-variant flex items-center gap-1 press-sm">
              <Icon name="mop" className="text-sm" /> 只清空我在本圈记录的数据
            </button>
          ) : (
            <div className="text-center card px-4 py-3.5 w-full animate-pop-in">
              <p className="text-xs text-on-surface-variant mb-2.5">只清你在当前圈记的吃过/想去，圈友的保留 · 删了找不回</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setConfirmReset(false)} className="px-5 py-2 rounded-full bg-surface-2 text-sm font-semibold press-sm">
                  取消
                </button>
                <button onClick={doReset} disabled={resetting} className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold shadow-glow press-sm">
                  {resetting ? '清空中…' : '确认清空'}
                </button>
              </div>
            </div>
          )}
          {resetMsg && <p className="text-xs text-on-surface-variant">{resetMsg}</p>}
          <div className="flex flex-col items-center gap-1 mt-2 opacity-70">
            <Wordmark className="text-lg" />
            <p className="text-[10px] text-on-surface-variant tracking-widest">和饭搭子一起点亮的美食地图 · v3.0</p>
          </div>
        </div>
      </div>

      <Presence show={memoryOpen} duration={240}>
        {memoryOpen && <MemoryScreen points={points} onClose={() => setMemoryOpen(false)} />}
      </Presence>
      <Presence show={sheet === 'circle'}>
        {sheet === 'circle' && <CircleSheet me={me} onClose={() => setSheet(null)} onChanged={onCircleChanged} />}
      </Presence>
      <Presence show={sheet === 'pw'}>{sheet === 'pw' && <ChangePwSheet onClose={() => setSheet(null)} />}</Presence>

      <Presence show={confirmLogout}>
        {confirmLogout && (
          <SheetShell onClose={() => setConfirmLogout(false)}>
            <div className="text-center pt-2">
              <div className="text-5xl mb-3">👋</div>
              <p className="text-xl font-bold tracking-tight">确认退出登录？</p>
              <p className="text-sm text-on-surface-variant mt-1 mb-6">记录都在云端，随时登录回来</p>
            </div>
            <div className="flex gap-2.5">
              <Button variant="soft" className="flex-1" onClick={() => setConfirmLogout(false)}>
                取消
              </Button>
              <Button className="flex-1" onClick={onLogout}>
                退出
              </Button>
            </div>
          </SheetShell>
        )}
      </Presence>
    </div>
  )
}

function MiniStat({ value, label }: { value: number; label: string }) {
  const v = Math.round(useCountUp(value))
  return (
    <div className="flex flex-col items-center [&+&]:border-l [&+&]:border-line">
      <span className="font-num font-semibold text-2xl leading-none tabular-nums">{v}</span>
      <span className="text-xs text-on-surface-variant mt-1.5">{label}</span>
    </div>
  )
}

type RowProps = Readonly<{ icon: string; label: string; hint?: string; onClick?: () => void }>
function Row({ icon, label, hint, onClick }: RowProps) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-surface-2 [&+&]:border-t [&+&]:border-line">
      <span className="w-9 h-9 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
        <Icon name={icon} className="text-[20px] text-on-surface" />
      </span>
      <span className="flex-1 font-medium text-[15px]">{label}</span>
      {hint && <span className="text-sm text-on-surface-variant">{hint}</span>}
      <Icon name="chevron_right" className="text-on-surface-variant/60" />
    </button>
  )
}

function ChangePwSheet({ onClose }: { onClose: () => void }) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const input = inputClass + ' mb-3'

  async function submit() {
    if (newPw.length < 4) {
      setMsg('新密码至少 4 位')
      return
    }
    setBusy(true)
    setMsg(null)
    try {
      await changePassword(oldPw, newPw)
      setMsg('已修改 ✓')
      setTimeout(onClose, 1200)
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || '失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-xl font-bold tracking-tight mb-4">修改密码</h3>
      <input type="password" placeholder="旧密码" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className={input} />
      <input type="password" placeholder="新密码（至少 4 位）" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={input} />
      {msg && <div className="text-sm text-on-surface-variant mb-3 animate-fade-up">{msg}</div>}
      <Button full loading={busy} disabled={!oldPw || !newPw} onClick={submit} className="mt-1">
        {busy ? '提交中…' : '确认修改'}
      </Button>
    </SheetShell>
  )
}
