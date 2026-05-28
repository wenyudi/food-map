import { useEffect, useState } from 'react'
import MapView from './pages/MapView'
import AddView from './pages/AddView'
import ListView from './pages/ListView'
import AccountView from './pages/AccountView'
import Login from './pages/Login'
import { getMe, getToken, clearToken } from './api'
import type { MeInfo } from './api'

type Tab = 'map' | 'add' | 'list' | 'me'

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
          />
        )}
        {tab === 'add' && <AddView onSubmitted={handleSubmitted} />}
        {tab === 'list' && (
          <ListView
            refreshKey={refreshKey}
            focusPoiId={focusPoiId}
            onPickStore={(id) => jumpTo('map', id)}
          />
        )}
        {tab === 'me' && <AccountView me={me} onLogout={handleLogout} />}
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
        <button onClick={() => setTab('me')} className={tab === 'me' ? 'active' : ''}>
          👤<span>我</span>
        </button>
      </nav>
    </div>
  )
}
