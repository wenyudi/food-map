import { useEffect, useState } from 'react'
import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
import Button from '../ui/Button'
import {
  getCircles, createCircleApi, switchCircleApi, joinCircleApi,
  getMembers, createInviteApi, renameCircleApi, setMemberRoleApi,
  removeMemberApi, transferOwnerApi, disbandCircleApi,
} from '../api'
import type { MeInfo, CircleBrief, CircleMember, CircleRole } from '../api'
import { inviteLink } from '../lib/invite'

const ROLE_CN: Record<CircleRole, string> = { owner: '圈主', editor: '记录员', viewer: '观光位' }
const ROLE_TONE: Record<CircleRole, string> = {
  owner: 'bg-accent-soft text-amber-ink',
  editor: 'bg-primary-soft text-primary-dark',
  viewer: 'bg-surface-2 text-on-surface-variant',
}

const inviteText = (code: string) => `来「吃了么」和我一起记美食：${inviteLink(code)}\n邀请码 ${code}（1 天内有效）`

type Props = Readonly<{ me: MeInfo; onClose: () => void; onChanged: () => void }>

/** 我的美食圈：切换 / 建圈 / 用码加入 / 成员·权限·邀请·改名·退出·解散 */
export default function CircleSheet({ me, onClose, onChanged }: Props) {
  const [circles, setCircles] = useState<CircleBrief[]>([])
  const [activeId, setActiveId] = useState<number | undefined>(me.circle_id)
  const [members, setMembers] = useState<CircleMember[]>([])
  const [owner, setOwner] = useState('')
  const [myRole, setMyRole] = useState<CircleRole>('viewer')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [invite, setInvite] = useState<{ code: string; role: CircleRole } | null>(null)
  const [copied, setCopied] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const [confirmDanger, setConfirmDanger] = useState<'leave' | 'disband' | null>(null)
  const [memberAction, setMemberAction] = useState<{ username: string; action: 'kick' | 'transfer' } | null>(null)

  async function load() {
    setErr(null)
    try {
      const r = await getCircles()
      setCircles(r.circles)
      setActiveId(r.active_circle_id)
      const m = await getMembers(r.active_circle_id)
      setMembers(m.members)
      setOwner(m.owner)
      setMyRole(m.my_role)
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '加载失败')
    }
  }
  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const active = circles.find((c) => c.id === activeId)
  const canWrite = myRole === 'owner' || myRole === 'editor'
  const isOwner = myRole === 'owner'

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true)
    setErr(null)
    try {
      await fn()
      onChanged()
      await load()
      after?.()
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '操作失败')
    } finally {
      setBusy(false)
    }
  }

  async function genInvite(role: 'editor' | 'viewer') {
    if (!active) return
    setBusy(true)
    setErr(null)
    setInvite(null)
    try {
      const r = await createInviteApi(active.id, role, 24)
      setInvite({ code: r.code, role: r.role })
    } catch (e: any) {
      setErr(e?.response?.data?.detail || '生成失败')
    } finally {
      setBusy(false)
    }
  }
  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(inviteText(code))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr(`复制失败，手动记下：${code}`)
    }
  }
  async function share(code: string) {
    try {
      await navigator.share({ title: '来吃了么一起记', text: inviteText(code) })
    } catch {
      /* 用户取消 */
    }
  }

  const smallBtn = 'text-xs font-semibold px-3 py-1.5 rounded-full press-sm disabled:opacity-50'

  return (
    <SheetShell onClose={onClose}>
      <h3 className="text-xl font-bold tracking-tight mb-4 pr-10">我的美食圈</h3>

      {/* 我的圈子（点击切换） */}
      <div className="card overflow-hidden mb-4">
        {circles.map((c, i) => {
          const on = c.id === activeId
          return (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => !on && act(() => switchCircleApi(c.id))}
              className="stagger w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-surface-2 [&+&]:border-t [&+&]:border-line"
              style={{ '--i': i } as React.CSSProperties}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                  on ? 'bg-primary text-white scale-100' : 'ring-[1.5px] ring-inset ring-on-surface-variant/30'
                }`}
              >
                {on && <Icon name="check" className="text-[14px] animate-pop-in" />}
              </span>
              <span className={`flex-1 truncate ${on ? 'font-semibold' : 'font-medium'}`}>{c.name}</span>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_TONE[c.role]}`}>{ROLE_CN[c.role]}</span>
              <span className="shrink-0 text-xs text-on-surface-variant font-num">{c.member_count}人</span>
            </button>
          )
        })}
      </div>

      {/* 建圈 + 加入 */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={20} placeholder="新圈子名" className="field flex-1 min-w-0 !py-2.5" />
          <button
            disabled={busy || !newName.trim()}
            onClick={() => act(() => createCircleApi(newName.trim()), () => setNewName(''))}
            className={`shrink-0 px-4 rounded-2xl font-semibold text-sm press-sm ${newName.trim() ? 'bg-primary text-white shadow-glow' : 'bg-surface-2 text-on-surface-variant/60'}`}
          >
            建圈
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="输入邀请码加入"
            className="field flex-1 min-w-0 !py-2.5 font-num tracking-wider"
          />
          <button
            disabled={busy || !joinCode.trim()}
            onClick={() => act(() => joinCircleApi(joinCode.trim()), () => setJoinCode(''))}
            className={`shrink-0 px-4 rounded-2xl font-semibold text-sm press-sm ${joinCode.trim() ? 'bg-primary text-white shadow-glow' : 'bg-surface-2 text-on-surface-variant/60'}`}
          >
            加入
          </button>
        </div>
      </div>

      {err && <div className="text-primary-dark text-sm bg-primary-soft rounded-2xl px-3.5 py-2.5 mb-4 animate-shake">{err}</div>}

      {/* 当前圈管理 */}
      {active && (
        <div className="border-t border-line pt-4">
          <div className="font-semibold mb-3 flex items-center gap-2 min-h-[32px]">
            {editingName ? (
              <>
                <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} maxLength={20} autoFocus className="field !py-1.5 !px-3 text-sm w-40" />
                <button onClick={() => act(() => renameCircleApi(active.id, renameVal.trim()), () => setEditingName(false))} className={`${smallBtn} bg-primary text-white`}>
                  保存
                </button>
                <button onClick={() => setEditingName(false)} className={`${smallBtn} bg-surface-2 text-on-surface-variant`}>
                  取消
                </button>
              </>
            ) : (
              <>
                <span className="truncate">管理「{active.name}」</span>
                {isOwner && (
                  <button
                    onClick={() => {
                      setRenameVal(active.name)
                      setEditingName(true)
                    }}
                    aria-label="改圈名"
                    className="w-7 h-7 rounded-full bg-surface-2 text-on-surface-variant flex items-center justify-center shrink-0 press-sm"
                  >
                    <Icon name="edit" className="text-[15px]" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* 成员列表 */}
          <div className="card overflow-hidden mb-2">
            {members.map((m) => {
              const manageable = isOwner && m.username !== owner
              const confirming = memberAction?.username === m.username
              return (
                <div key={m.username} className="px-3.5 py-3 flex flex-col gap-2 text-sm [&+&]:border-t [&+&]:border-line">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-soft to-primary-soft flex items-center justify-center font-semibold text-primary-dark shrink-0">
                      {(m.nickname || m.username).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 font-medium truncate">
                      {m.nickname || m.username}
                      {m.username === me.username && <span className="text-on-surface-variant">（我）</span>}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${ROLE_TONE[m.role]}`}>{ROLE_CN[m.role]}</span>
                  </div>
                  {manageable && !confirming && (
                    <div className="flex flex-wrap gap-1.5 pl-[42px]">
                      <button
                        disabled={busy}
                        onClick={() => act(() => setMemberRoleApi(active.id, m.username, m.role === 'editor' ? 'viewer' : 'editor'))}
                        className={`${smallBtn} bg-surface-2 text-on-surface-variant`}
                      >
                        {m.role === 'editor' ? '设为观光位' : '设为记录员'}
                      </button>
                      <button disabled={busy} onClick={() => setMemberAction({ username: m.username, action: 'transfer' })} className={`${smallBtn} bg-surface-2 text-on-surface-variant`}>
                        转让圈主
                      </button>
                      <button disabled={busy} onClick={() => setMemberAction({ username: m.username, action: 'kick' })} className={`${smallBtn} bg-primary-soft text-primary-dark`}>
                        移出
                      </button>
                    </div>
                  )}
                  {manageable && confirming && (
                    <div className="flex items-center justify-between gap-2 bg-primary-soft/60 rounded-2xl px-3 py-2 ml-[42px] animate-pop-in">
                      <span className="text-xs text-primary-dark min-w-0">
                        {memberAction?.action === 'transfer' ? '转让后你将变成记录员' : '移出后 TA 就看不到这个圈了'}
                      </span>
                      <span className="flex gap-1.5 shrink-0">
                        <button onClick={() => setMemberAction(null)} className={`${smallBtn} bg-white text-on-surface`}>
                          取消
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            act(
                              () => (memberAction?.action === 'transfer' ? transferOwnerApi(active.id, m.username) : removeMemberApi(active.id, m.username)),
                              () => setMemberAction(null),
                            )
                          }
                          className={`${smallBtn} bg-primary text-white`}
                        >
                          {memberAction?.action === 'transfer' ? '确认转让' : '确认移出'}
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 角色说明：让分配权限的人一眼看懂三种角色能干嘛 */}
          <p className="text-[11px] text-on-surface-variant mb-4 px-0.5">💡 记录员能记能改 · 观光位只看不记 · 圈主管成员</p>

          {/* 邀请码（圈主可邀记录员/观光位；记录员只能邀观光位） */}
          {canWrite && (
            <div className="mb-4">
              <div className="flex gap-2">
                {isOwner && (
                  <Button className="flex-1 !py-2.5 text-sm" disabled={busy} onClick={() => genInvite('editor')}>
                    <Icon name="person_add" className="text-[18px]" /> 邀请记录员
                  </Button>
                )}
                <Button variant="white" className="flex-1 !py-2.5 text-sm" disabled={busy} onClick={() => genInvite('viewer')}>
                  邀请观光位
                </Button>
              </div>
              {invite && (
                <div className="flex items-center gap-2 mt-3 rounded-2xl bg-accent-soft px-4 py-3 animate-pop-in">
                  <code className="font-num font-semibold text-xl tracking-[0.2em] flex-1">{invite.code}</code>
                  <span className="text-xs text-on-surface-variant shrink-0">{ROLE_CN[invite.role]} · 24h</span>
                  <button onClick={() => copy(invite.code)} className={`${smallBtn} ${copied ? 'bg-sage text-white' : 'bg-white text-on-surface'}`}>
                    {copied ? '已复制 ✓' : '复制'}
                  </button>
                  {!!navigator.share && (
                    <button onClick={() => share(invite.code)} className={`${smallBtn} bg-primary text-white`}>
                      分享
                    </button>
                  )}
                </div>
              )}
              <p className="text-xs text-on-surface-variant mt-2 px-0.5">邀请 1 天内有效。发给朋友，点开链接登录或注册后就能加入。</p>
            </div>
          )}

          {/* 危险操作 */}
          <div className="pt-1">
            {confirmDanger === null ? (
              <div className="flex gap-3">
                {!isOwner && (
                  <button onClick={() => setConfirmDanger('leave')} className="text-xs text-on-surface-variant press-sm">
                    退出这个圈子
                  </button>
                )}
                {isOwner && (
                  <button onClick={() => setConfirmDanger('disband')} className="text-xs text-primary-dark press-sm">
                    解散这个圈子
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs rounded-2xl bg-primary-soft/60 p-3.5 animate-pop-in">
                <p className="text-primary-dark mb-2.5">
                  {confirmDanger === 'disband' ? '解散后这个圈的所有记录都会删掉，找不回' : '退出后就看不到这个圈的记录了'}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDanger(null)} className={`${smallBtn} bg-white text-on-surface`}>
                    取消
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => (confirmDanger === 'disband' ? disbandCircleApi(active.id) : removeMemberApi(active.id, me.username)),
                        () => {
                          setConfirmDanger(null)
                          onClose()
                        },
                      )
                    }
                    className={`${smallBtn} bg-primary text-white`}
                  >
                    {confirmDanger === 'disband' ? '解散' : '退出'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </SheetShell>
  )
}
