import { useEffect, useState } from 'react'
import MapView from './pages/MapView'
import AddView from './pages/AddView'
import ListView from './pages/ListView'
import AccountView from './pages/AccountView'
import Login from './pages/Login'
import { getMe, getToken, clearToken } from './api'
import type { MeInfo } from './api'

type Tab = 'map' | 'add' | 'list' | 'account'

export default function App() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'app'>('loading')
  const [me, setMe] = useState<MeInfo | null>(null)
  const [tab, setTab] = useState<Tab>('map')
  const [refreshKey, setRefreshKey] = useState(0)
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null)

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
          <AddView onSubmitted={handleSubmitted} />
        )}
        {tab === 'list' && (
          <ListView
            refreshKey={refreshKey}
            focusPoiId={focusPoiId}
            onPickStore={(id) => jumpTo('map', id)}
            onJumpToAdd={() => setTab('add')}
            myUsername={me.username}
          />
        )}
        {tab === 'account' && (
          <AccountView me={me} onLogout={handleLogout} />
        )}
      </div>
      <nav className="tabs">
        <button onClick={() => setTab('map')} className={tab === 'map' ? 'active' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M9 3 3 5.2V21l6-2.2 6 2.2 6-2.2V3l-6 2.2L9 3z" />
            <path d="M9 3.2v15.6M15 5.2v15.6" strokeWidth="1.5" />
          </svg>
          <span>地图</span>
        </button>
        <button onClick={() => setTab('list')} className={tab === 'list' ? 'active' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="5" cy="6.5" r="1.7" fill="currentColor" stroke="none" /><path d="M10 6.5h10" />
            <circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none" /><path d="M10 12h10" />
            <circle cx="5" cy="17.5" r="1.7" fill="currentColor" stroke="none" /><path d="M10 17.5h10" />
          </svg>
          <span>列表</span>
        </button>
        <button onClick={() => setTab('add')} className={'tab-add' + (tab === 'add' ? ' active' : '')}>
          <span className="tab-add-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" />
            </svg>
          </span>
          <span>记一笔</span>
        </button>
        <button onClick={() => setTab('account')} className={tab === 'account' ? 'active' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-4 3.2-6.5 7-6.5s7 2.5 7 6.5" />
          </svg>
          <span>我的</span>
        </button>
      </nav>

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
