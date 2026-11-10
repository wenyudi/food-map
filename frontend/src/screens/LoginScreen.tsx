import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import Wordmark from '../ui/Wordmark'
import Tape from '../ui/Tape'
import Button from '../ui/Button'
import { login, register, sendCode, resetPassword, setToken } from '../api'
import type { MeInfo } from '../api'

type LoginScreenProps = Readonly<{
  onLoggedIn: (me: MeInfo) => void
  /** 打开的是邀请链接 */
  invited?: boolean
}>

type Mode = 'login' | 'register' | 'reset'

const emailValid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim())

/** 登录 / 注册 / 找回密码 —— 邮箱登录 + 昵称 + 邮箱验证码（贴纸风） */
export default function LoginScreen({ onLoggedIn, invited = false }: LoginScreenProps) {
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

  const submitLabel = mode === 'login' ? '登录' : mode === 'register' ? '注册' : '重置密码'
  const submitDisabled =
    busy ||
    (mode === 'login' && (!emailValid(email) || !password)) ||
    (mode === 'register' && (!emailValid(email) || !code.trim() || !nickname.trim() || password.length < 4)) ||
    (mode === 'reset' && (!emailValid(email) || !code.trim() || password.length < 4))

  return (
    <div className="h-full overflow-y-auto relative">
      <MapHero />

      <div className="relative min-h-full flex flex-col justify-end px-5 pt-[max(9.5rem,24dvh)] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/* 品牌 */}
        <div className="flex flex-col items-center mb-5 animate-fade-up">
          <Wordmark className="text-[46px]" />
          <p className="text-on-surface-variant text-sm mt-2">{invited ? '饭搭子邀请你一起记，登录或注册后就能加入' : '和饭搭子一起点亮的美食地图'}</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="card relative px-5 pt-6 pb-5 flex flex-col animate-fade-up"
          style={{ animationDelay: '80ms' }}
        >
          <Tape color="#f2a9b8" angle={-5} width={72} className="-top-2 left-1/2 -ml-9" />
          {/* 登录 / 注册 切换（滑块）；找回密码时换成返回入口 */}
          {mode === 'reset' ? (
            <div className="mb-5 animate-fade-in">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-primary press-sm"
              >
                <Icon name="arrow_back" className="text-lg" /> 返回登录
              </button>
              <p className="text-xl font-bold tracking-tight mt-3">找回密码</p>
              <p className="text-sm text-on-surface-variant mt-0.5">用注册邮箱收个验证码，重设一个新密码</p>
            </div>
          ) : (
            <div className="relative grid grid-cols-2 p-1 rounded-full bg-surface-2 mb-5">
              <span
                aria-hidden
                className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-on-surface transition-transform duration-500 ease-spring"
                style={{ transform: mode === 'register' ? 'translateX(100%)' : 'none' }}
              />
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`relative py-2.5 rounded-full font-semibold text-sm transition-colors duration-300 ${
                    mode === m ? 'text-white' : 'text-on-surface-variant'
                  }`}
                >
                  {m === 'login' ? '登录' : '注册'}
                </button>
              ))}
            </div>
          )}

          <div key={mode} className="flex flex-col">
            {/* 邮箱：所有模式都要 */}
            <Field
              i={0}
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
                i={1}
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
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors bg-primary-soft text-primary-dark disabled:bg-surface-2 disabled:text-on-surface-variant/50 press-sm"
                  >
                    {cooldown > 0 ? <span className="font-num tabular-nums">{cooldown}s</span> : sending ? '发送中' : '发送'}
                  </button>
                }
              />
            )}

            {/* 昵称：仅注册 */}
            {mode === 'register' && (
              <Field i={2} icon="sentiment_satisfied" label="昵称" placeholder="圈子里大家怎么称呼你" maxLength={20} value={nickname} onChange={setNickname} />
            )}

            {/* 密码（找回时是「新密码」） */}
            <Field
              i={3}
              icon="lock"
              label={mode === 'reset' ? '新密码' : '密码'}
              placeholder={mode === 'login' ? '输入密码' : '设置密码（至少 4 位）'}
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              trailing={
                <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? '隐藏密码' : '显示密码'} className="text-on-surface-variant press-sm">
                  <Icon name={showPw ? 'visibility' : 'visibility_off'} className="text-xl" />
                </button>
              }
            />
          </div>

          {/* 忘记密码入口：仅登录 */}
          {mode === 'login' && (
            <button type="button" onClick={() => switchMode('reset')} className="self-end -mt-1 mb-1 text-xs font-medium text-on-surface-variant hover:text-primary press-sm">
              忘记密码？
            </button>
          )}

          {err && (
            <div key={err} className="flex items-start gap-1.5 mt-1 mb-1 text-sm text-primary-dark bg-primary-soft rounded-2xl px-3.5 py-2.5 animate-shake">
              <Icon name="error" className="text-[18px] mt-px" />
              {err}
            </div>
          )}
          {ok && !err && (
            <div className="flex items-start gap-1.5 mt-1 mb-1 text-sm text-sage-ink bg-sage-soft rounded-2xl px-3.5 py-2.5 animate-fade-up">
              <Icon name="check_circle" className="text-[18px] mt-px" />
              {ok}
            </div>
          )}

          {mode === 'register' && <p className="mt-1 mb-1 text-xs text-on-surface-variant">注册后会自动给你建一个专属美食圈 🍜</p>}

          <Button full type="submit" loading={busy} disabled={submitDisabled} className="mt-4 !py-4 text-base">
            {busy ? '稍等…' : submitLabel}
            {!busy && <Icon name="arrow_forward" className="text-xl" />}
          </Button>
        </form>
      </div>
    </div>
  )
}

// 迷你地图上的店：一家家亮起来；最后一家还没吃过（虚线），等你去点亮
const PINS = [
  { e: '🍲', x: '16%', y: '46%', ring: '#e65c3c', d: 150 },
  { e: '🍜', x: '41%', y: '22%', ring: '#f4b740', d: 330 },
  { e: '🍣', x: '69%', y: '38%', ring: '#e65c3c', d: 510 },
  { e: '🥟', x: '86%', y: '16%', ring: '#5fa777', d: 690 },
  { e: '🌱', x: '84%', y: '52%', ring: '#e5788f', d: 900, want: true },
]

/** 登录页主视觉：一小片手绘地图，店铺一家家亮起来——这就是这个 app 干的事 */
function MapHero() {
  return (
    <div className="absolute inset-x-0 top-0 h-[max(15rem,38dvh)] overflow-hidden [mask-image:linear-gradient(to_bottom,#000_62%,transparent)]" aria-hidden>
      <svg viewBox="0 0 390 320" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <rect width="390" height="320" fill="#ebe0d1" />
        {/* 街区色块（取自 app 图标的地图格子） */}
        <path d="M0 0H150L120 96 0 118Z" fill="#f8d8c8" />
        <path d="M250 0H390V92L282 112Z" fill="#dfe8cc" />
        <path d="M150 128 262 136 240 236 128 214Z" fill="#fae6bb" />
        <path d="M296 150 390 132V262L276 250Z" fill="#f8d8c8" />
        {/* 江 */}
        <path d="M-20 262C60 218 112 300 196 276S320 196 420 226" fill="none" stroke="#cfdfdc" strokeWidth="30" strokeLinecap="round" />
        {/* 路 */}
        <g fill="none" stroke="#fff" strokeLinecap="round">
          <path d="M-10 122 124 98 262 134 400 110" strokeWidth="9" />
          <path d="M152 -10 120 98 128 214 104 330" strokeWidth="7" />
          <path d="M254 -10 282 112 262 134 240 236 262 330" strokeWidth="7" />
          <path d="M-10 40 80 60 124 98" strokeWidth="4" />
          <path d="M282 112 330 60 400 44" strokeWidth="4" />
          <path d="M128 214 240 236 300 250 400 262" strokeWidth="5" />
        </g>
      </svg>
      {PINS.map((p) => (
        <span key={p.e} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
          <span className="marker-wrap block" style={{ '--d': `${p.d}ms`, '--mk-intro': 1 } as React.CSSProperties}>
            <span className={`marker-dot ${p.want ? 'want' : ''}`} style={{ '--ring': p.ring } as React.CSSProperties}>
              {p.e}
            </span>
          </span>
        </span>
      ))}
    </div>
  )
}

type FieldProps = Readonly<{
  i: number
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

function Field({ i, icon, label, placeholder, value, onChange, type = 'text', trailing, autoComplete, inputMode, maxLength }: FieldProps) {
  return (
    <label className="w-full mb-3.5 block stagger" style={{ '--i': i } as React.CSSProperties}>
      <span className="block section-label mb-1.5 px-1">{label}</span>
      <span className="flex items-center gap-2.5 w-full rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-transparent transition-all duration-200 focus-within:bg-white focus-within:ring-primary/40 focus-within:shadow-ring">
        <Icon name={icon} className="text-on-surface-variant text-xl" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-on-surface placeholder:text-on-surface-variant/55"
        />
        {trailing}
      </span>
    </label>
  )
}
