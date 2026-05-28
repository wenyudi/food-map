import { useState } from 'react'
import { login, setToken } from '../api'
import type { MeInfo } from '../api'

interface Props {
  onLoggedIn: (me: MeInfo) => void
}

export default function Login({ onLoggedIn }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    setBusy(true)
    setErr(null)
    try {
      const r = await login(username.trim(), password)
      setToken(r.token)
      onLoggedIn({ username: r.username, role: r.role })
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">🥘</div>
        <h1 className="login-title">饼饼の美食地图</h1>
        <p className="login-subtitle">和你一起的吃饭回忆</p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          {err && <div className="login-error">{err}</div>}
          <button type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? '登录中…' : '登 录'}
          </button>
        </form>
      </div>
    </div>
  )
}
