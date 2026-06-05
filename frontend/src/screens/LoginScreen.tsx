import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import Wordmark from '../ui/Wordmark'
import StickerButton from '../ui/StickerButton'
import { login, register, sendCode, resetPassword, setToken } from '../api'
import type { MeInfo } from '../api'

type LoginScreenProps = Readonly<{
  onLoggedIn: (me: MeInfo) => void
}>

type Mode = 'login' | 'register' | 'reset'

const emailValid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())

/** 登录 / 注册 / 找回密码 —— 邮箱登录 + 昵称 + 邮箱验证码（贴纸风） */
export default function LoginScreen({ onLoggedIn }: LoginScreenProps) {
  const [mode, setMode] = useState<Mode>('login')
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function switchMode(m: Mode) {
    setMode(m)
    setErr(null)
    setOk(null)
  }

  async function handleSendCode() {
    setErr(null)
    if (!emailValid(email)) {
      setErr('先填一个正确的邮箱')
      return
    }
    setSending(true)
    try {
      const r = await sendCode(email.trim().toLowerCase(), mode === 'reset' ? 'reset' : 'register')
      setCooldown(r.cooldown || 60)
      setOk(r.dev_mode ? '验证码已发送（开发模式：码在服务器日志里）' : '验证码已发送，查收邮箱 📮')
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '验证码发送失败')
    } finally {
      setSending(false)
    }
  }

  async function submit() {
    setErr(null)
    setOk(null)
    const mail = email.trim().toLowerCase()
    if (mode === 'login') {
      if (!emailValid(email) || !password) return setErr('填一下邮箱和密码')
      setBusy(true)
      try {
        const r = await login(mail, password)
        setToken(r.token)
        onLoggedIn({ username: r.username, nickname: r.nickname, role: r.role, circle_id: r.circle_id, circle_role: r.circle_role })
      } catch (e: any) {
        setErr(e?.response?.data?.detail || '登录失败')
      } finally {
        setBusy(false)
      }
    } else if (mode === 'register') {
      if (!emailValid(email)) return setErr('先填一个正确的邮箱')
      if (!code.trim()) return setErr('请填邮箱验证码')
      if (!nickname.trim()) return setErr('起个昵称吧')
      if (password.length < 4) return setErr('密码至少 4 位')
      setBusy(true)
      try {
        const r = await register(mail, code.trim(), password, nickname.trim())
        setToken(r.token)
        onLoggedIn({ username: r.username, nickname: r.nickname, role: r.role, circle_id: r.circle_id, circle_role: r.circle_role })
      } catch (e: any) {
        setErr(e?.response?.data?.detail || '注册失败')
      } finally {
        setBusy(false)
      }
    } else {
      // reset
      if (!emailValid(email)) return setErr('先填一个正确的邮箱')
      if (!code.trim()) return setErr('请填验证码')
      if (password.length < 4) return setErr('新密码至少 4 位')
      setBusy(true)
      try {
        await resetPassword(mail, code.trim(), password)
        setMode('login')
        setCode('')
        setPassword('')
        setOk('密码已重置，用新密码登录吧 🎉')
      } catch (e: any) {
        setErr(e?.response?.data?.detail || '重置失败')
      } finally {
        setBusy(false)
      }
    }
  }

  const submitLabel = mode === 'login' ? '登 录' : mode === 'register' ? '注 册' : '重置密码'
  const submitDisabled =
    busy ||
    (mode === 'login' && (!emailValid(email) || !password)) ||
    (mode === 'register' && (!emailValid(email) || !code.trim() || !nickname.trim() || password.length < 4)) ||
    (mode === 'reset' && (!emailValid(email) || !code.trim() || password.length < 4))

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
          <div className="w-20 h-20 rounded-2xl border-2 border-on-surface bg-accent shadow-sticker flex items-center justify-center mb-4">
            <Icon name="ramen_dining" className="text-4xl text-on-surface" />
          </div>

          <Wordmark className="text-4xl" />
          <p className="text-on-surface-variant font-bold text-sm mt-2 mb-6">和饭搭子一起点亮的美食地图</p>

          {/* 登录 / 注册 切换；找回密码时换成返回入口 */}
          {mode === 'reset' ? (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="self-start mb-5 flex items-center gap-1 text-sm font-bold text-on-surface-variant hover:text-primary"
            >
              <Icon name="arrow_back" className="text-lg" /> 返回登录
            </button>
          ) : (
            <div className="w-full grid grid-cols-2 gap-1 p-1 rounded-full border-2 border-on-surface bg-white shadow-sticker-sm mb-5">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
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
          )}

          {mode === 'reset' && (
            <p className="self-start -mt-1 mb-3 text-base font-headline font-bold text-on-surface">找回密码 🔑</p>
          )}

          {/* 邮箱：所有模式都要 */}
          <Field
            icon="mail"
            label="邮箱"
            placeholder={mode === 'login' ? '登录邮箱' : '收验证码的邮箱'}
            type="email"
            inputMode="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
          />

          {/* 验证码：注册 / 找回，带发送按钮 + 倒计时 */}
          {mode !== 'login' && (
            <Field
              icon="pin"
              label="验证码"
              placeholder="邮箱里的 6 位码"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, ''))}
              trailing={
                <button
                  type="button"
                  disabled={cooldown > 0 || sending || !emailValid(email)}
                  onClick={handleSendCode}
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-headline font-bold border-2 whitespace-nowrap transition-all ${
                    cooldown > 0 || sending || !emailValid(email)
                      ? 'bg-white/40 text-on-surface-variant/50 border-on-surface/25'
                      : 'bg-accent text-on-surface border-on-surface shadow-sticker-sm active:translate-y-0.5'
                  }`}
                >
                  {cooldown > 0 ? `${cooldown}s` : sending ? '发送中' : '发送'}
                </button>
              }
            />
          )}

          {/* 昵称：仅注册 */}
          {mode === 'register' && (
            <Field
              icon="sentiment_satisfied"
              label="昵称"
              placeholder="圈子里大家怎么称呼你"
              maxLength={20}
              value={nickname}
              onChange={setNickname}
            />
          )}

          {/* 密码（找回时是「新密码」） */}
          <Field
            icon="lock"
            label={mode === 'reset' ? '新密码' : '密码'}
            placeholder={mode === 'login' ? '专属甜点密码' : '设置密码（至少 4 位）'}
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

          {/* 忘记密码入口：仅登录 */}
          {mode === 'login' && (
            <button
              type="button"
              onClick={() => switchMode('reset')}
              className="self-end -mt-1 mb-1 text-xs font-bold text-on-surface-variant hover:text-primary"
            >
              忘记密码？
            </button>
          )}

          {err && (
            <div className="self-stretch mt-1 mb-1 text-sm font-bold text-primary bg-primary/10 border-2 border-primary/30 rounded-lg px-3 py-1.5">
              {err}
            </div>
          )}
          {ok && !err && (
            <div className="self-stretch mt-1 mb-1 text-sm font-bold text-green-accent bg-green-accent/10 border-2 border-green-accent/30 rounded-lg px-3 py-1.5">
              {ok}
            </div>
          )}

          {mode === 'register' && (
            <p className="self-start mt-1 mb-1 text-xs font-bold text-on-surface-variant">注册后会自动给你建一个专属美食圈 🍜</p>
          )}

          <StickerButton full type="submit" disabled={submitDisabled} className="mt-4 py-4 text-lg">
            {busy ? '稍等…' : submitLabel} <Icon name="restaurant" className="text-xl" />
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
  inputMode?: 'text' | 'numeric' | 'email'
  maxLength?: number
}>

function Field({
  icon,
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  trailing,
  autoComplete,
  inputMode,
  maxLength,
}: FieldProps) {
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
          inputMode={inputMode}
          maxLength={maxLength}
          className="flex-1 min-w-0 bg-transparent outline-none text-on-surface placeholder:text-on-surface-variant/60 font-body"
        />
        {trailing}
      </div>
    </div>
  )
}
