import { useState } from 'react'
import { login, register, setToken } from '../api'
import type { MeInfo } from '../api'
import { APP_NAME, APP_SLOGAN } from '../brand'

interface Props {
  onLoggedIn: (me: MeInfo) => void
}

type Mode = 'login' | 'register'

export default function Login({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username.trim() || !password) return
    if (mode === 'register' && !inviteCode.trim()) {
      setErr('请填邀请码')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const r = mode === 'login'
        ? await login(username.trim(), password)
        : await register(username.trim(), password, inviteCode.trim())
      setToken(r.token)
      onLoggedIn({ username: r.username, role: r.role })
    } catch (e: any) {
      setErr(e?.response?.data?.detail || (mode === 'login' ? '登录失败' : '注册失败'))
    } finally {
      setBusy(false)
    }
  }

  function switchMode(m: Mode) {
    setMode(m)
    setErr(null)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img className="brand-badge" src="/icon.png" alt={APP_NAME} width={80} height={80} />
        <h1 className="login-title">{APP_NAME}</h1>
        <p className="login-subtitle">{APP_SLOGAN}</p>

        <div className="login-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => switchMode('login')}
          >登录</button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => switchMode('register')}
          >注册</button>
        </div>

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
            placeholder={mode === 'register' ? '设置密码（至少 4 位）' : '密码'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && (
            <input
              type="text"
              placeholder="邀请码"
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value)}
              autoCapitalize="characters"
            />
          )}
          {err && <div className="login-error">{err}</div>}
          <button type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? '稍等…' : mode === 'login' ? '登 录' : '注 册'}
          </button>
        </form>

        {mode === 'register' && (
          <p className="login-hint">没有邀请码？找管理员要一个 🎟️</p>
        )}
      </div>
    </div>
  )
}
