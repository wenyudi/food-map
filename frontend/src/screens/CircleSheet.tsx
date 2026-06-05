import { useEffect, useState } from 'react'
import SheetShell from '../ui/SheetShell'
import Icon from '../ui/Icon'
import {
  getCircles, createCircleApi, switchCircleApi, joinCircleApi,
  getMembers, createInviteApi, renameCircleApi, setMemberRoleApi,
  removeMemberApi, disbandCircleApi,
} from '../api'
import type { MeInfo, CircleBrief, CircleMember, CircleRole } from '../api'

const ROLE_CN: Record<CircleRole, string> = { owner: '圈主', editor: '记录员', viewer: '观光位' }
const ROLE_TONE: Record<CircleRole, string> = {
  owner: 'bg-accent',
  editor: 'bg-primary text-white',
  viewer: 'bg-on-surface/10',
}

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
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setErr(`复制失败，手动记下：${code}`)
    }
  }

  return (
    <SheetShell onClose={onClose}>
      <div className="max-h-[72vh] overflow-y-auto -mx-1 px-1">
        <h3 className="font-headline text-xl mb-3">🍜 我的美食圈</h3>

        {/* 我的圈子（点击切换） */}
        <div className="flex flex-col gap-2 mb-4">
          {circles.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => c.id !== activeId && act(() => switchCircleApi(c.id))}
              className={`flex items-center justify-between rounded-xl border-2 border-on-surface px-3 py-2.5 text-left press-sm ${
                c.id === activeId ? 'bg-accent shadow-sticker-sm' : 'bg-white'
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {c.id === activeId && <Icon name="check_circle" className="text-on-surface text-lg shrink-0" />}
                <span className="font-bold truncate">{c.name}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0 text-xs">
                <span className={`px-2 py-0.5 rounded-full border-2 border-on-surface font-bold ${ROLE_TONE[c.role]}`}>{ROLE_CN[c.role]}</span>
                <span className="text-on-surface-variant">{c.member_count}人</span>
              </span>
            </button>
          ))}
        </div>

        {/* 建圈 + 加入 */}
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={20}
              placeholder="新圈子名"
              className="flex-1 min-w-0 rounded-full border-2 border-on-surface bg-white px-3 py-2 outline-none font-body shadow-sticker-sm"
            />
            <button
              disabled={busy || !newName.trim()}
              onClick={() => act(() => createCircleApi(newName.trim()), () => setNewName(''))}
              className="shrink-0 px-4 rounded-full border-2 border-on-surface bg-primary text-white font-bold press-sm disabled:opacity-40"
            >
              建圈
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="输入邀请码加入"
              className="flex-1 min-w-0 rounded-full border-2 border-on-surface bg-white px-3 py-2 outline-none font-num tracking-wider shadow-sticker-sm"
            />
            <button
              disabled={busy || !joinCode.trim()}
              onClick={() => act(() => joinCircleApi(joinCode.trim()), () => setJoinCode(''))}
              className="shrink-0 px-4 rounded-full border-2 border-on-surface bg-white font-bold press-sm disabled:opacity-40"
            >
              加入
            </button>
          </div>
        </div>

        {err && <div className="text-primary font-bold text-sm bg-primary/10 rounded-lg px-3 py-2 mb-3">{err}</div>}

        {/* 当前圈管理 */}
        {active && (
          <div className="border-t-2 border-dashed border-on-surface/15 pt-3">
            <div className="font-bold mb-2 flex items-center gap-2">
              {editingName ? (
                <>
                  <input
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    maxLength={20}
                    className="rounded-lg border-2 border-on-surface bg-white px-2 py-1 text-sm w-36"
                  />
                  <button onClick={() => act(() => renameCircleApi(active.id, renameVal.trim()), () => setEditingName(false))} className="text-primary text-sm font-bold">
                    存
                  </button>
                  <button onClick={() => setEditingName(false)} className="text-on-surface-variant text-sm">取消</button>
                </>
              ) : (
                <>
                  <span className="truncate">管理「{active.name}」</span>
                  {isOwner && (
                    <button onClick={() => { setRenameVal(active.name); setEditingName(true) }} className="text-on-surface-variant shrink-0">
                      <Icon name="edit" className="text-base" />
                    </button>
                  )}
                </>
              )}
            </div>

            {/* 成员列表 */}
            <div className="flex flex-col gap-1.5 mb-3">
              {members.map((m) => (
                <div key={m.username} className="flex items-center justify-between text-sm">
                  <span className="font-bold truncate">
                    {m.nickname || m.username}
                    {m.username === me.username && ' （我）'}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-2 py-0.5 rounded-full border-2 border-on-surface text-xs font-bold ${ROLE_TONE[m.role]}`}>{ROLE_CN[m.role]}</span>
                    {isOwner && m.username !== owner && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => act(() => setMemberRoleApi(active.id, m.username, m.role === 'editor' ? 'viewer' : 'editor'))}
                          className="text-xs text-on-surface-variant"
                        >
                          {m.role === 'editor' ? '降观光' : '升记录'}
                        </button>
                        <button disabled={busy} onClick={() => act(() => removeMemberApi(active.id, m.username))} className="text-xs text-primary">
                          踢
                        </button>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* 邀请码（圈主可邀记录员/观光位；记录员只能邀观光位） */}
            {canWrite && (
              <div className="mb-3">
                <div className="flex gap-2">
                  {isOwner && (
                    <button disabled={busy} onClick={() => genInvite('editor')} className="flex-1 py-2 rounded-full border-2 border-on-surface bg-primary text-white text-sm font-bold press-sm">
                      邀请记录员
                    </button>
                  )}
                  <button disabled={busy} onClick={() => genInvite('viewer')} className="flex-1 py-2 rounded-full border-2 border-on-surface bg-white text-sm font-bold press-sm">
                    邀请观光位
                  </button>
                </div>
                {invite && (
                  <div className="flex items-center gap-2 mt-2 rounded-xl border-2 border-on-surface bg-accent/40 px-3 py-2">
                    <code className="font-num font-bold text-lg tracking-wider flex-1">{invite.code}</code>
                    <span className="text-xs text-on-surface-variant shrink-0">{ROLE_CN[invite.role]}·24h</span>
                    <button onClick={() => copy(invite.code)} className="text-sm font-bold text-primary shrink-0">
                      {copied ? '已复制✓' : '复制'}
                    </button>
                  </div>
                )}
                <p className="text-xs text-on-surface-variant mt-1.5">邀请码 1 天内有效，发给朋友 → TA 注册后输码加入。</p>
              </div>
            )}

            {/* 危险操作 */}
            <div className="pt-1">
              {confirmDanger === null ? (
                <div className="flex gap-3">
                  {!isOwner && (
                    <button onClick={() => setConfirmDanger('leave')} className="text-xs text-on-surface-variant">
                      退出这个圈子
                    </button>
                  )}
                  {isOwner && (
                    <button onClick={() => setConfirmDanger('disband')} className="text-xs text-primary">
                      解散这个圈子
                    </button>
                  )}
                </div>
              ) : (
                <div className="text-xs">
                  <p className="text-on-surface-variant mb-1.5">
                    {confirmDanger === 'disband' ? '解散后这个圈的所有记录都会删掉，找不回' : '退出后就看不到这个圈的记录了'}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setConfirmDanger(null)} className="px-3 py-1 rounded-full border-2 border-on-surface bg-white font-bold">
                      取消
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(
                          () => (confirmDanger === 'disband' ? disbandCircleApi(active.id) : removeMemberApi(active.id, me.username)),
                          () => { setConfirmDanger(null); onClose() },
                        )
                      }
                      className="px-3 py-1 rounded-full border-2 border-on-surface bg-primary text-white font-bold"
                    >
                      {confirmDanger === 'disband' ? '解散' : '退出'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </SheetShell>
  )
}
