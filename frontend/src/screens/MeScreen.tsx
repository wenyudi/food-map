import { useEffect, useState } from 'react'
import Icon from '../ui/Icon'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'
import MemoryScreen from './MemoryScreen'
import CircleSheet from './CircleSheet'
import { getStats, getPoints, exportData, resetMine, changePassword, getCircles } from '../api'
import type { MeInfo, Point } from '../api'

type MeScreenProps = Readonly<{
  me: MeInfo
  onLogout: () => void
  onCircleChanged: () => void
}>

type Sheet = 'circle' | 'pw' | null

export default function MeScreen({ me, onLogout, onCircleChanged }: MeScreenProps) {
  const [meals, setMeals] = useState<number | null>(null)
  const [circleName, setCircleName] = useState<string>('')
  const [circleCount, setCircleCount] = useState<number>(0)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [memory, setMemory] = useState<Point[] | null>(null)
  const [loadingMem, setLoadingMem] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  // 随当前活跃圈子刷新：顿数 + 圈名
  useEffect(() => {
    getStats().then((s) => setMeals(s.total_visits)).catch(() => {})
    getCircles()
      .then((r) => {
        const active = r.circles.find((c) => c.id === r.active_circle_id)
        setCircleName(active?.name || '')
        setCircleCount(r.circles.length)
      })
      .catch(() => {})
  }, [me.circle_id])

  async function openMemory() {
    if (loadingMem) return
    setLoadingMem(true)
    try {
      setMemory(await getPoints())
    } catch {
      setMemory([])
    } finally {
      setLoadingMem(false)
    }
  }

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
    } catch (e: any) {
      setResetMsg(e?.response?.data?.detail || '清空失败')
    } finally {
      setResetting(false)
    }
  }

  const initial = (me.nickname || me.username || '?').slice(0, 1).toUpperCase()

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-[calc(env(safe-area-inset-top)_+_1.5rem)] pb-10 space-y-5">
        {/* 资料卡 */}
        <div className="sticker rounded-2xl p-5 flex items-center gap-4">
          <div className="w-20 h-20 rounded-full border-2 border-on-surface bg-accent flex items-center justify-center font-headline text-3xl shrink-0">
            {initial}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <h3 className="font-headline text-2xl truncate">{me.nickname || me.username}</h3>
            <button
              onClick={() => setSheet('circle')}
              className="flex items-center gap-1 bg-primary/10 border border-primary/25 rounded-full pl-2.5 pr-2 py-1 text-primary font-bold text-sm w-fit press-sm"
            >
              <Icon name="group" className="text-base" />
              <span className="truncate max-w-[140px]">{circleName || '我的圈子'}</span>
              {meals != null && <span className="text-primary/70">· {meals}顿</span>}
              <Icon name="expand_more" className="text-base" />
            </button>
          </div>
        </div>

        {/* 美食回忆报告 */}
        <button
          onClick={openMemory}
          disabled={loadingMem}
          className="w-full text-left bg-gradient-to-br from-primary to-[#ff8c75] rounded-2xl border-2 border-on-surface shadow-sticker p-5 flex items-center justify-between press"
        >
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 bg-white rounded-xl border-2 border-on-surface flex items-center justify-center shrink-0">
              <Icon name="menu_book" className="text-primary text-3xl" />
            </span>
            <div>
              <h4 className="font-headline text-xl text-white">美食回忆报告</h4>
              <p className="text-white/90 text-sm">{loadingMem ? '正在翻看你们的足迹…' : '翻翻这个圈子的食光故事'}</p>
            </div>
          </div>
          <span className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
            <Icon name="chevron_right" className="text-white" />
          </span>
        </button>

        {/* 设置列表 */}
        <div className="sticker rounded-2xl overflow-hidden divide-y-2 divide-on-surface/10">
          <Row icon="group" box="bg-[#fef2f2]" label={`我的圈子${circleCount > 1 ? ` · ${circleCount} 个` : ''}`} onClick={() => setSheet('circle')} />
          <Row icon="cloud_download" box="bg-[#f0f9ff]" label={exporting ? '导出中…' : '数据备份与导出'} onClick={doExport} />
          <Row icon="lock_reset" box="bg-[#fdf2f8]" label="修改密码" onClick={() => setSheet('pw')} />
          <Row icon="logout" box="bg-[#fff7ed]" label="退出登录" onClick={() => setConfirmLogout(true)} />
        </div>
        {exportMsg && <p className="text-center text-sm text-on-surface-variant">{exportMsg}</p>}

        {/* 清空 + 版本 */}
        <div className="pt-2 pb-2 flex flex-col items-center gap-3">
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
              <Icon name="mop" className="text-sm" /> 只清空我在本圈记录的数据
            </button>
          ) : (
            <div className="text-center">
              <p className="text-xs text-on-surface-variant mb-1.5">只清你在当前圈记的吃过/想去，圈友的保留 · 删了找不回</p>
              <div className="flex gap-2 justify-center">
                <button onClick={() => setConfirmReset(false)} className="px-4 py-1.5 rounded-full border-2 border-on-surface bg-white text-sm font-bold press-sm">
                  取消
                </button>
                <button onClick={doReset} disabled={resetting} className="px-4 py-1.5 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold press-sm">
                  {resetting ? '清空中…' : '清空'}
                </button>
              </div>
            </div>
          )}
          {resetMsg && <p className="text-xs text-on-surface-variant">{resetMsg}</p>}
          <p className="text-[10px] font-black text-on-surface-variant/60 tracking-widest text-center">
            吃了么 · 和饭搭子一起点亮的美食地图 · v3.0
          </p>
        </div>
      </div>

      {memory && <MemoryScreen points={memory} onClose={() => setMemory(null)} />}
      {sheet === 'circle' && <CircleSheet me={me} onClose={() => setSheet(null)} onChanged={onCircleChanged} />}
      {sheet === 'pw' && <ChangePwSheet onClose={() => setSheet(null)} />}

      {confirmLogout && (
        <SheetShell onClose={() => setConfirmLogout(false)}>
          <p className="font-headline text-xl text-center mb-4">确认退出登录？</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmLogout(false)} className="flex-1 py-3 rounded-full border-2 border-on-surface bg-white font-bold press-sm">
              取消
            </button>
            <button onClick={onLogout} className="flex-1 py-3 rounded-full border-2 border-on-surface bg-primary text-white font-bold press-sm">
              退出
            </button>
          </div>
        </SheetShell>
      )}
    </div>
  )
}

type RowProps = Readonly<{ icon: string; box: string; label: string; onClick?: () => void }>
function Row({ icon, box, label, onClick }: RowProps) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 active:bg-surface">
      <span className="flex items-center gap-3">
        <span className={`w-10 h-10 rounded-lg border-2 border-on-surface flex items-center justify-center ${box}`}>
          <Icon name={icon} className="text-on-surface" />
        </span>
        <span className="font-bold">{label}</span>
      </span>
      <Icon name="chevron_right" className="text-on-surface-variant" />
    </button>
  )
}

function ChangePwSheet({ onClose }: { onClose: () => void }) {
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const input = 'w-full rounded-xl border-2 border-on-surface bg-white px-3 py-2.5 outline-none font-body shadow-sticker-sm mb-3'

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
      <h3 className="font-headline text-xl mb-3">🔑 修改密码</h3>
      <input type="password" placeholder="旧密码" value={oldPw} onChange={(e) => setOldPw(e.target.value)} className={input} />
      <input type="password" placeholder="新密码（至少 4 位）" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={input} />
      {msg && <div className="text-sm font-bold text-on-surface-variant mb-2">{msg}</div>}
      <StickerButton full disabled={busy || !oldPw || !newPw} onClick={submit}>
        {busy ? '提交中…' : '确认修改'}
      </StickerButton>
    </SheetShell>
  )
}
