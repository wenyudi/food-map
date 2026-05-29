import { useEffect, useState } from 'react'
import MapView from './pages/MapView'
import AddView from './pages/AddView'
import ListView from './pages/ListView'
import AccountView from './pages/AccountView'
import Login from './pages/Login'
import { getMe, getToken, clearToken } from './api'
import type { MeInfo } from './api'

type Tab = 'map' | 'add' | 'list'

export default function App() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'app'>('loading')
  const [me, setMe] = useState<MeInfo | null>(null)
  const [tab, setTab] = useState<Tab>('map')
  const [refreshKey, setRefreshKey] = useState(0)
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null)
  const [showAccount, setShowAccount] = useState(false)

  // 启动时校验 token
  useEffect(() => {
    if (!getToken()) {
      setAuthState('login')
      return
    }
    getMe()
      .then(u => { setMe(u); setAuthState('app') })
      .catch(() => { clearToken(); setAuthState('login') })
  }, [])

  function handleLoggedIn(user: MeInfo) {
    setMe(user)
    setAuthState('app')
  }

  function handleLogout() {
    setShowAccount(false)
    setMe(null)
    setAuthState('login')
    setTab('map')
  }

  function handleSubmitted() {
    setRefreshKey(k => k + 1)
    setTab('map')
  }

  function jumpTo(target: Tab, poiId?: string) {
    if (poiId) setFocusPoiId(poiId)
    setTab(target)
  }

  if (authState === 'loading') {
    return <div className="boot-loading">⌛️ 加载中…</div>
  }

  if (authState === 'login' || !me) {
    return <Login onLoggedIn={handleLoggedIn} />
  }

  return (
    <div className="app">
      <div className="main">
        {tab === 'map' && (
          <MapView
            refreshKey={refreshKey}
            focusPoiId={focusPoiId}
            onConsumeFocus={() => setFocusPoiId(null)}
            onJumpToAdd={() => setTab('add')}
          />
        )}
        {tab === 'add' && (
          <AddView
            onSubmitted={handleSubmitted}
            onOpenAccount={() => setShowAccount(true)}
          />
        )}
        {tab === 'list' && (
          <ListView
            refreshKey={refreshKey}
            focusPoiId={focusPoiId}
            onPickStore={(id) => jumpTo('map', id)}
          />
        )}
      </div>
      <nav className="tabs">
        <button onClick={() => setTab('map')} className={tab === 'map' ? 'active' : ''}>
          🗺️<span>地图</span>
        </button>
        <button onClick={() => setTab('add')} className={tab === 'add' ? 'active' : ''}>
          ✏️<span>记一笔</span>
        </button>
        <button onClick={() => setTab('list')} className={tab === 'list' ? 'active' : ''}>
          📋<span>列表</span>
        </button>
      </nav>

      {showAccount && (
        <div className="account-overlay">
          <AccountView me={me} onLogout={handleLogout} onClose={() => setShowAccount(false)} />
        </div>
      )}

      <Lightbox />
    </div>
  )
}

// 点开任意带 .zoomable 的图片 → 全屏看大图（事件委托，连地图 popup 里的图也能用）
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
    <div className="lightbox" onClick={() => setSrc(null)}>
      <img src={src} alt="" />
      <div className="lightbox-tip">点击任意处关闭</div>
    </div>
  )
}
