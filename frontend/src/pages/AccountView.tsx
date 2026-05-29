import { useEffect, useState } from 'react'
import { listUsers, deleteUserApi, changePassword, clearToken, genInvite, listInvites, revokeInvite } from '../api'
import type { MeInfo, UserItem, InviteCode } from '../api'

interface Props {
  me: MeInfo
  onLogout: () => void
}

export default function AccountView({ me, onLogout }: Props) {
  const isAdmin = me.role === 'admin'
  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <div className="page account-page">
      <div className="acc-topbar">
        <span className="acc-topbar-title">我的账户</span>
      </div>

      <div className="acc-card">
        <div className="acc-avatar">{me.username.slice(0, 1).toUpperCase()}</div>
        <div className="acc-name">{me.username}</div>
        <div className="acc-role">{isAdmin ? '管理员' : '成员'}</div>
      </div>

      <ChangePasswordBlock />

      <InviteCodes isAdmin={isAdmin} />
      {isAdmin && <UserManagement currentUsername={me.username} />}

      {!confirmLogout ? (
        <button className="logout-btn" onClick={() => setConfirmLogout(true)}>登出</button>
      ) : (
        <div className="logout-confirm">
          <span>确认登出？</span>
          <button className="lc-cancel" onClick={() => setConfirmLogout(false)}>取消</button>
          <button className="lc-yes" onClick={() => { clearToken(); onLogout() }}>登出</button>
        </div>
      )}
    </div>
  )
}

function ChangePasswordBlock() {
  const [open, setOpen] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function submit() {
    if (newPw.length < 4) { setMsg('新密码至少 4 位'); return }
    setBusy(true)
    setMsg(null)
    try {
      await changePassword(oldPw, newPw)
      setMsg('已修改 ✓')
      setOldPw(''); setNewPw('')
      setTimeout(() => { setOpen(false); setMsg(null) }, 1500)
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || '失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acc-section">
      <button className="acc-section-head" onClick={() => setOpen(o => !o)}>
        <span>🔑 修改密码</span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="acc-section-body">
          <input type="password" placeholder="旧密码" value={oldPw} onChange={e => setOldPw(e.target.value)} />
          <input type="password" placeholder="新密码（至少 4 位）" value={newPw} onChange={e => setNewPw(e.target.value)} />
          <button onClick={submit} disabled={busy || !oldPw || !newPw} className="primary">
            {busy ? '提交中…' : '确认修改'}
          </button>
          {msg && <div className="acc-msg">{msg}</div>}
        </div>
      )}
    </div>
  )
}

function InviteCodes({ isAdmin }: { isAdmin: boolean }) {
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'mine' | 'new' | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try { setInvites(await listInvites()) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

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

  async function revoke(code: string) {
    setErr(null)
    try {
      await revokeInvite(code)
      setRevoking(null)
      refresh()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '撤销失败')
    }
  }

  const unused = invites.filter(i => !i.used_by)
  const used = invites.filter(i => i.used_by)

  return (
    <div className="acc-section">
      <div className="acc-section-head static">
        <span>🎟️ 邀请码</span>
      </div>
      <div className="acc-section-body">
        <div className="invite-gen">
          <button onClick={() => generate(false)} disabled={busy !== null} className="primary">
            {busy === 'mine' ? '生成中…' : '👫 邀请进我的地图'}
          </button>
          {isAdmin && (
            <button onClick={() => generate(true)} disabled={busy !== null} className="ghost">
              {busy === 'new' ? '生成中…' : '🌱 给朋友建新地图'}
            </button>
          )}
        </div>
        <div className="invite-hint">
          {isAdmin
            ? '「进我的地图」= 和你共享同一张图（如另一半）；「新地图」= 朋友拥有独立的一张，互不可见。'
            : '把邀请码发给另一半 → TA 注册后和你共享同一张地图。'}
        </div>

        {err && <div className="acc-msg err">{err}</div>}
        {loading && <div className="acc-msg">加载中…</div>}

        {unused.map(i => (
          <div className="invite-row" key={i.code}>
            <code className="invite-code" onClick={() => copy(i.code)}>{i.code}</code>
            <span className={'invite-kind' + (i.circle_id == null ? ' new' : '')}>
              {i.circle_id == null ? '新地图' : '我的图'}
            </span>
            {revoking === i.code ? (
              <>
                <button className="invite-copy" onClick={() => setRevoking(null)}>取消</button>
                <button className="invite-del" onClick={() => revoke(i.code)}>确认撤销</button>
              </>
            ) : (
              <>
                <button className="invite-copy" onClick={() => copy(i.code)}>
                  {copied === i.code ? '已复制 ✓' : '复制'}
                </button>
                <button className="invite-del" onClick={() => setRevoking(i.code)}>撤销</button>
              </>
            )}
          </div>
        ))}

        {used.length > 0 && (
          <>
            <div className="invite-divider">已使用</div>
            {used.map(i => (
              <div className="invite-row used" key={i.code}>
                <code className="invite-code">{i.code}</code>
                <span className="invite-status">→ {i.used_by}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function UserManagement({ currentUsername }: { currentUsername: string }) {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try { setUsers(await listUsers()) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function remove(username: string) {
    setErr(null)
    try {
      await deleteUserApi(username)
      setConfirmDel(null)
      refresh()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '删除失败')
    }
  }

  return (
    <div className="acc-section">
      <div className="acc-section-head static">
        <span>👥 成员（{users.length}）</span>
      </div>
      <div className="acc-section-body">
        {err && <div className="acc-msg err">{err}</div>}
        {loading && <div className="acc-msg">加载中…</div>}
        {!loading && users.map(u => (
          <div className="user-row" key={u.id}>
            <span className="user-name">{u.username}</span>
            <span className="user-role">{u.role === 'admin' ? '管理员' : '成员'}</span>
            {u.username !== currentUsername && (
              confirmDel === u.username ? (
                <span className="user-del-confirm">
                  <button className="udc-cancel" onClick={() => setConfirmDel(null)}>取消</button>
                  <button className="udc-yes" onClick={() => remove(u.username)}>确认删除</button>
                </span>
              ) : (
                <button className="user-del" onClick={() => setConfirmDel(u.username)}>删除</button>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
