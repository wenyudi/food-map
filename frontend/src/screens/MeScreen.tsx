import { useEffect, useState } from 'react'
import TopBar, { IconBtn } from '../ui/TopBar'
import Icon from '../ui/Icon'
import SheetShell from '../ui/SheetShell'
import StickerButton from '../ui/StickerButton'
import MemoryScreen from './MemoryScreen'
import {
  getStats,
  getPoints,
  exportData,
  resetMine,
  changePassword,
  genInvite,
  listInvites,
  revokeInvite,
  listUsers,
  deleteUserApi,
} from '../api'
import type { MeInfo, Point, InviteCode, UserItem } from '../api'

type MeScreenProps = Readonly<{
  me: MeInfo
  onLogout: () => void
}>

type Sheet = 'invite' | 'pw' | null

export default function MeScreen({ me, onLogout }: MeScreenProps) {
  const isAdmin = me.role === 'admin'
  const [meals, setMeals] = useState<number | null>(null)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [memory, setMemory] = useState<Point[] | null>(null)
  const [loadingMem, setLoadingMem] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    getStats()
      .then((s) => setMeals(s.total_visits))
      .catch(() => {})
  }, [])

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

  return (
    <div className="h-full flex flex-col">
      <TopBar
        title="我的"
        subtitle="你的吃货档案"
        icon="person"
        right={<IconBtn icon="settings" />}
      />

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-6 pb-10 space-y-5">
        {/* 资料卡 */}
        <div className="sticker rounded-2xl p-5 flex items-center gap-4">
          <div className="w-20 h-20 rounded-full border-2 border-on-surface bg-accent flex items-center justify-center font-headline text-3xl shrink-0">
            {me.username.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            <h3 className="font-headline text-2xl truncate">{me.username}</h3>
            <span className="bg-primary/10 border border-primary/25 rounded-full px-3 py-1 text-primary font-bold text-sm w-fit">
              {isAdmin ? '管理员' : '成员'}
              {meals != null && ` · 一起 ${meals} 顿`}
            </span>
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
              <p className="text-white/90 text-sm">{loadingMem ? '正在翻看你们的足迹…' : '翻翻你俩的年度食光故事'}</p>
            </div>
          </div>
          <span className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center shrink-0">
            <Icon name="chevron_right" className="text-white" />
          </span>
        </button>

        {/* 设置列表 */}
        <div className="sticker rounded-2xl overflow-hidden divide-y-2 divide-on-surface/10">
          <Row icon="cloud_download" box="bg-[#f0f9ff]" label={exporting ? '导出中…' : '数据备份与导出'} onClick={doExport} />
          <Row icon="group_add" box="bg-[#fef2f2]" label="邀请 TA 加入食光圈" onClick={() => setSheet('invite')} />
          <Row icon="lock_reset" box="bg-[#fdf2f8]" label="修改密码" onClick={() => setSheet('pw')} />
          <Row icon="logout" box="bg-[#fff7ed]" label="退出登录" onClick={() => setConfirmLogout(true)} />
        </div>
        {exportMsg && <p className="text-center text-sm text-on-surface-variant">{exportMsg}</p>}

        {/* 清空 + 版本 */}
        <div className="pt-2 pb-2 flex flex-col items-center gap-3">
          {!confirmReset ? (
            <button onClick={() => setConfirmReset(true)} className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
              <Icon name="mop" className="text-sm" /> 只清空我记录的数据
            </button>
          ) : (
            <div className="text-center">
              <p className="text-xs text-on-surface-variant mb-1.5">只清你记的吃过/想去，同伴的保留 · 删了找不回</p>
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
            吃了么 · 你俩一起点亮的食光地图 · v2.0
          </p>
        </div>
      </div>

      {memory && <MemoryScreen points={memory} onClose={() => setMemory(null)} />}
      {sheet === 'invite' && <InviteSheet isAdmin={isAdmin} myUsername={me.username} onClose={() => setSheet(null)} />}
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

/* ===== 邀请码 + 成员（admin） ===== */
function InviteSheet({ isAdmin, myUsername, onClose }: { isAdmin: boolean; myUsername: string; onClose: () => void }) {
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [busy, setBusy] = useState<'mine' | 'new' | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [users, setUsers] = useState<UserItem[]>([])

  async function refresh() {
    try {
      setInvites(await listInvites())
    } catch {}
    if (isAdmin) {
      try {
        setUsers(await listUsers())
      } catch {}
    }
  }
  useEffect(() => {
    refresh()
  }, []) // eslint-disable-line

  async function generate(newCircle: boolean) {
    setBusy(newCircle ? 'new' : 'mine')
    setErr(null)
    try {
      await genInvite(newCircle)
      await refresh()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '生成失败')
    } finally {
      setBusy(null)
    }
  }
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setErr(`复制失败，手动记下：${code}`)
    }
  }
  const unused = invites.filter((i) => !i.used_by)

  return (
    <SheetShell onClose={onClose}>
      <h3 className="font-headline text-xl mb-3">🎟️ 邀请 TA 加入</h3>
      <div className="flex flex-col gap-2 mb-2">
        <StickerButton full disabled={busy !== null} onClick={() => generate(false)}>
          {busy === 'mine' ? '生成中…' : '👫 邀请进我的地图'}
        </StickerButton>
        {isAdmin && (
          <button
            onClick={() => generate(true)}
            disabled={busy !== null}
            className="w-full py-3 rounded-full border-2 border-on-surface bg-white font-bold press-sm"
          >
            {busy === 'new' ? '生成中…' : '🌱 给朋友建新地图'}
          </button>
        )}
      </div>
      <p className="text-xs text-on-surface-variant mb-3">把邀请码发给另一半 → TA 注册后和你共享同一张地图。</p>
      {err && <div className="text-primary font-bold text-sm bg-primary/10 rounded-lg px-3 py-2 mb-2">{err}</div>}

      <div className="flex flex-col gap-2">
        {unused.map((i) => (
          <div key={i.code} className="flex items-center gap-2 rounded-xl border-2 border-on-surface bg-white shadow-sticker-sm px-3 py-2">
            <code className="font-num font-bold text-lg tracking-wider flex-1">{i.code}</code>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border-2 border-on-surface ${i.circle_id == null ? 'bg-tertiary' : 'bg-accent'}`}>
              {i.circle_id == null ? '新地图' : '我的图'}
            </span>
            <button onClick={() => copy(i.code)} className="text-sm font-bold text-primary">
              {copied === i.code ? '已复制✓' : '复制'}
            </button>
            <button onClick={() => revokeInvite(i.code).then(refresh)} className="text-sm text-on-surface-variant">
              撤销
            </button>
          </div>
        ))}
        {unused.length === 0 && <p className="text-center text-on-surface-variant text-sm py-2">还没有未使用的邀请码</p>}
      </div>

      {isAdmin && users.length > 0 && (
        <div className="mt-4 pt-3 border-t-2 border-dashed border-on-surface/15">
          <div className="font-bold mb-2">👥 成员（{users.length}）</div>
          <div className="flex flex-col gap-1.5">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <span className="font-bold">{u.username}</span>
                <span className="flex items-center gap-2">
                  <span className="text-on-surface-variant text-xs">{u.role === 'admin' ? '管理员' : '成员'}</span>
                  {u.username !== myUsername && (
                    <button onClick={() => deleteUserApi(u.username).then(refresh)} className="text-primary text-xs">
                      删除
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SheetShell>
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
