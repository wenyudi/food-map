import { useEffect, useState } from 'react'
import { listUsers, deleteUserApi, changePassword, clearToken, genInvite, listInvites, revokeInvite } from '../api'
import type { MeInfo, UserItem, InviteCode } from '../api'

interface Props {
  me: MeInfo
  onLogout: () => void
  onClose: () => void
}

export default function AccountView({ me, onLogout, onClose }: Props) {
  return (
    <div className="page account-page">
      <div className="acc-topbar">
        <button className="acc-back" onClick={onClose} aria-label="返回">←</button>
        <span className="acc-topbar-title">账户</span>
      </div>

      <div className="acc-card">
        <div className="acc-avatar">{me.username.slice(0, 1).toUpperCase()}</div>
        <div className="acc-name">{me.username}</div>
        <div className="acc-role">{me.role === 'admin' ? '管理员' : '成员'}</div>
      </div>

      <ChangePasswordBlock />

      {me.role === 'admin' && <InviteCodes />}
      {me.role === 'admin' && <UserManagement currentUsername={me.username} />}

      <button className="logout-btn" onClick={() => {
        if (!confirm('确认要登出吗？')) return
        clearToken()
        onLogout()
      }}>
        登出
      </button>
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

function InviteCodes() {
  const [invites, setInvites] = useState<InviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try { setInvites(await listInvites()) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function generate() {
    setBusy(true)
    try {
      await genInvite()
      await refresh()
    } catch (e: any) {
      alert(e?.response?.data?.detail || '生成失败')
    } finally {
      setBusy(false)
    }
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // 某些环境 clipboard 不可用，退而提示手动复制
      alert(`邀请码：${code}`)
    }
  }

  async function revoke(code: string) {
    if (!confirm(`撤销邀请码 ${code}？`)) return
    try {
      await revokeInvite(code)
      refresh()
    } catch (e: any) {
      alert(e?.response?.data?.detail || '撤销失败')
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
        <button onClick={generate} disabled={busy} className="primary">
          {busy ? '生成中…' : '+ 生成新邀请码'}
        </button>
        <div className="invite-hint">把邀请码发给对方 → TA 在登录页「注册」填码 + 自设密码</div>

        {loading && <div className="acc-msg">加载中…</div>}

        {unused.map(i => (
          <div className="invite-row" key={i.code}>
            <code className="invite-code" onClick={() => copy(i.code)}>{i.code}</code>
            <span className="invite-status unused">未使用</span>
            <button className="invite-copy" onClick={() => copy(i.code)}>
              {copied === i.code ? '已复制 ✓' : '复制'}
            </button>
            <button className="invite-del" onClick={() => revoke(i.code)}>撤销</button>
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

  async function refresh() {
    setLoading(true)
    try { setUsers(await listUsers()) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function remove(username: string) {
    if (!confirm(`确认要删除 ${username} 吗？TA 的数据会保留。`)) return
    try {
      await deleteUserApi(username)
      refresh()
    } catch (e: any) {
      alert(e?.response?.data?.detail || '删除失败')
    }
  }

  return (
    <div className="acc-section">
      <div className="acc-section-head static">
        <span>👥 成员（{users.length}）</span>
      </div>
      <div className="acc-section-body">
        {loading && <div className="acc-msg">加载中…</div>}
        {!loading && users.map(u => (
          <div className="user-row" key={u.id}>
            <span className="user-name">{u.username}</span>
            <span className="user-role">{u.role === 'admin' ? '管理员' : '成员'}</span>
            {u.username !== currentUsername && (
              <button className="user-del" onClick={() => remove(u.username)}>删除</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
