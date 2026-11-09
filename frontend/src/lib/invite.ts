// 邀请链接：/?invite=CODE。打开时先存下来（还要登录 / 注册），进了 app 再问要不要加入。

const LS_KEY = 'pending_invite'

export function captureInvite(): string | null {
  const url = new URL(window.location.href)
  const code = (url.searchParams.get('invite') || '').trim().toUpperCase()
  if (code) {
    localStorage.setItem(LS_KEY, code)
    url.searchParams.delete('invite')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  return localStorage.getItem(LS_KEY)
}

export const clearInvite = () => localStorage.removeItem(LS_KEY)

export const inviteLink = (code: string) => `${window.location.origin}/?invite=${code}`
