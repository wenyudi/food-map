import { useEffect, useState } from 'react'
import { listUsers, createUserApi, deleteUserApi, changePassword, clearToken } from '../api'
import type { MeInfo, UserItem } from '../api'

interface Props {
  me: MeInfo
  onLogout: () => void
}

export default function AccountView({ me, onLogout }: Props) {
  return (
    <div className="page account-page">
      <div className="acc-card">
        <div className="acc-avatar">{me.username.slice(0, 1).toUpperCase()}</div>
        <div className="acc-name">{me.username}</div>
        <div className="acc-role">{me.role === 'admin' ? '管理员' : '成员'}</div>
      </div>

      <ChangePasswordBlock />

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

function UserManagement({ currentUsername }: { currentUsername: string }) {
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try { setUsers(await listUsers()) } finally { setLoading(false) }
  }

  useEffect(() => { refresh() }, [])

  async function add() {
    if (!newUsername.trim() || newPassword.length < 4) { setMsg('用户名 + 至少 4 位密码'); return }
    setBusy(true)
    setMsg(null)
    try {
      await createUserApi(newUsername.trim(), newPassword)
      setNewUsername(''); setNewPassword('')
      setMsg('已添加 ✓')
      refresh()
      setTimeout(() => setMsg(null), 2000)
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || '失败')
    } finally {
      setBusy(false)
    }
  }

  async function remove(username: string) {
    if (!confirm(`确认要删除 ${username} 吗？她/他的数据会保留。`)) return
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
        <span>👥 管理用户</span>
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

        <div className="add-user-form">
          <input
            placeholder="新用户名（比如：饼饼）"
            value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
          />
          <input
            type="password"
            placeholder="密码（至少 4 位）"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
          />
          <button onClick={add} disabled={busy} className="primary">
            {busy ? '添加中…' : '+ 添加'}
          </button>
          {msg && <div className="acc-msg">{msg}</div>}
        </div>
      </div>
    </div>
  )
}
