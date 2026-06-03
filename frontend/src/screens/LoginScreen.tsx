import { useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import Wordmark from '../ui/Wordmark'
import StickerButton from '../ui/StickerButton'
import { login, register, setToken } from '../api'
import type { MeInfo } from '../api'

type LoginScreenProps = Readonly<{
  onLoggedIn: (me: MeInfo) => void
}>

/** 登录/注册页 —— 吃了么 hero + 双输入 + 大按钮（贴纸风），接真实 JWT */
export default function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showPw, setShowPw] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit() {
    if (!username.trim() || !password) return
    if (mode === 'register' && !invite.trim()) {
      setErr('请填邀请码')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const r =
        mode === 'login'
          ? await login(username.trim(), password)
          : await register(username.trim(), password, invite.trim())
      setToken(r.token)
      onLoggedIn({ username: r.username, role: r.role })
    } catch (e: any) {
      setErr(e?.response?.data?.detail || (mode === 'login' ? '登录失败' : '注册失败'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-surface">
      <div className="min-h-full flex flex-col justify-center px-6 py-10">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="sticker rounded-2xl px-6 pt-8 pb-7 flex flex-col items-center"
        >
          {/* App 图标 */}
          <div className="w-20 h-20 rounded-2xl border-2 border-on-surface bg-accent shadow-sticker flex items-center justify-center mb-4">
            <Icon name="ramen_dining" className="text-4xl text-on-surface" />
          </div>

          <Wordmark className="text-4xl" />
          <p className="text-on-surface-variant font-bold text-sm mt-2 mb-6">你俩一起点亮的食光地图</p>

          {/* 登录 / 注册 切换 */}
          <div className="w-full grid grid-cols-2 gap-1 p-1 rounded-full border-2 border-on-surface bg-white shadow-sticker-sm mb-5">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setErr(null)
                }}
                className={`py-2 rounded-full font-headline font-bold text-sm transition-all ${
                  mode === m
                    ? 'bg-primary text-white border-2 border-on-surface shadow-sticker-sm'
                    : 'text-on-surface-variant'
                }`}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <Field
            icon="person"
            label="用户名"
            placeholder="你的吃货暗号"
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />
          <Field
            icon="lock"
            label="密码"
            placeholder={mode === 'register' ? '设置密码（至少 4 位）' : '专属甜点密码'}
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            trailing={
              <button type="button" onClick={() => setShowPw((s) => !s)} className="text-on-surface-variant">
                <Icon name={showPw ? 'visibility' : 'visibility_off'} className="text-xl" />
              </button>
            }
          />
          {mode === 'register' && (
            <Field
              icon="key"
              label="邀请码"
              placeholder="对象给你的暗号"
              value={invite}
              onChange={setInvite}
            />
          )}

          {err && (
            <div className="self-stretch -mt-1 mb-2 text-sm font-bold text-primary bg-primary/10 border-2 border-primary/30 rounded-lg px-3 py-1.5">
              {err}
            </div>
          )}

          {mode === 'register' && (
            <p className="self-start -mt-1 mb-1 text-xs font-bold text-on-surface-variant">没有邀请码？找管理员要一个 🎟️</p>
          )}

          <StickerButton full type="submit" disabled={busy || !username.trim() || !password} className="mt-4 py-4 text-lg">
            {busy ? '稍等…' : mode === 'login' ? '登 录' : '注 册'} <Icon name="restaurant" className="text-xl" />
          </StickerButton>
        </form>
      </div>
    </div>
  )
}

type FieldProps = Readonly<{
  icon: string
  label: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  type?: string
  trailing?: ReactNode
  autoComplete?: string
}>

function Field({ icon, label, placeholder, value, onChange, type = 'text', trailing, autoComplete }: FieldProps) {
  return (
    <div className="w-full relative mb-4">
      <span className="absolute -top-2.5 left-4 px-1.5 bg-white text-xs font-bold text-on-surface border-2 border-on-surface rounded-md z-10">
        {label}
      </span>
      <div className="flex items-center gap-2 w-full rounded-full border-2 border-on-surface bg-white px-4 py-3 shadow-sticker-sm">
        <Icon name={icon} className="text-on-surface-variant text-xl" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="flex-1 min-w-0 bg-transparent outline-none text-on-surface placeholder:text-on-surface-variant/60 font-body"
        />
        {trailing}
      </div>
    </div>
  )
}
