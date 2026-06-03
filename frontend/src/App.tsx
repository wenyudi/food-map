import { useEffect, useState } from 'react'
import TabBar from './ui/TabBar'
import type { TabKey } from './ui/TabBar'
import LoginScreen from './screens/LoginScreen'
import MapScreen from './screens/MapScreen'
import ListScreen from './screens/ListScreen'
import AddScreen from './screens/AddScreen'
import MeScreen from './screens/MeScreen'
import { getMe, getToken, clearToken } from './api'
import type { MeInfo } from './api'

export default function App() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'app'>('loading')
  const [me, setMe] = useState<MeInfo | null>(null)
  const [tab, setTab] = useState<TabKey>('map')
  const [refreshKey, setRefreshKey] = useState(0)
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null)

  useEffect(() => {
    if (!getToken()) {
      setAuthState('login')
      return
    }
    getMe()
      .then((u) => {
        setMe(u)
        setAuthState('app')
      })
      .catch(() => {
        clearToken()
        setAuthState('login')
      })
  }, [])

  function handleLoggedIn(user: MeInfo) {
    setMe(user)
    setAuthState('app')
  }
  function handleLogout() {
    clearToken()
    setMe(null)
    setAuthState('login')
    setTab('map')
  }
  function handleSubmitted() {
    setRefreshKey((k) => k + 1)
    setTab('map')
  }

  if (authState === 'loading') {
    return (
      <Phone>
        <div className="h-full flex items-center justify-center text-on-surface-variant font-bold">⌛️ 加载中…</div>
      </Phone>
    )
  }

  if (authState === 'login' || !me) {
    return (
      <Phone>
        <LoginScreen onLoggedIn={handleLoggedIn} />
      </Phone>
    )
  }

  return (
    <Phone tab={tab} onTab={setTab}>
      {tab === 'map' && (
        <MapScreen
          refreshKey={refreshKey}
          focusPoiId={focusPoiId}
          onConsumeFocus={() => setFocusPoiId(null)}
          onJumpToAdd={() => setTab('add')}
        />
      )}
      {tab === 'list' && (
        <ListScreen
          refreshKey={refreshKey}
          focusPoiId={focusPoiId}
          onPickStore={(id) => {
            setFocusPoiId(id)
            setTab('map')
          }}
          onJumpToAdd={() => setTab('add')}
          myUsername={me.username}
        />
      )}
      {tab === 'add' && <AddScreen onSubmitted={handleSubmitted} />}
      {tab === 'me' && <MeScreen me={me} onLogout={handleLogout} />}
    </Phone>
  )
}

type PhoneProps = Readonly<{
  children: React.ReactNode
  tab?: TabKey
  onTab?: (t: TabKey) => void
}>

/** 手机视口外壳：居中、限宽、底部共享导航 */
function Phone({ children, tab, onTab }: PhoneProps) {
  return (
    <div className="h-[100dvh] w-full max-w-[440px] mx-auto flex flex-col overflow-hidden bg-surface relative">
      <main className="flex-1 min-h-0 relative overflow-hidden">{children}</main>
      {tab && onTab && <TabBar active={tab} onChange={onTab} />}
      <Lightbox />
    </div>
  )
}

/** 点开任意 .zoomable 图片 → 全屏看大图（事件委托，连 leaflet popup 里的也行） */
function Lightbox() {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (t.tagName === 'IMG' && t.classList.contains('zoomable')) {
        setSrc((t as HTMLImageElement).src)
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])
  if (!src) return null
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/85 flex flex-col items-center justify-center gap-3 p-4"
      onClick={() => setSrc(null)}
    >
      <img src={src} alt="" className="max-w-full max-h-[82vh] rounded-xl border-2 border-white/20" />
      <div className="text-white/70 text-sm">点击任意处关闭</div>
    </div>
  )
}
