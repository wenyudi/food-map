import { lazy, Suspense, useCallback, useContext, useEffect, useState } from 'react'
import TabBar from './ui/TabBar'
import type { TabKey } from './ui/TabBar'
import Button from './ui/Button'
import Presence from './ui/Presence'
import { PresenceLeaving } from './ui/presenceContext'
import SheetShell from './ui/SheetShell'
import Toast from './ui/Toast'
import Wordmark from './ui/Wordmark'
import LoginScreen from './screens/LoginScreen'
import ListScreen from './screens/ListScreen'
import AddScreen from './screens/AddScreen'
import MeScreen from './screens/MeScreen'
import { getCircles, getMe, getToken, clearToken, invalidatePoints, joinCircleApi } from './api'
import type { MeInfo } from './api'
import { captureInvite, clearInvite } from './lib/invite'
import { useActivity } from './lib/useActivity'
import { useBackClose } from './lib/useBackClose'
import { useBrowse } from './lib/useBrowse'

// 地图页带 leaflet（~150KB），懒加载——首屏壳先出来，地图块随后到
const MapScreen = lazy(() => import('./screens/MapScreen'))

export default function App() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'app'>('loading')
  const [me, setMe] = useState<MeInfo | null>(null)
  const [tab, setTab] = useState<TabKey>('map')
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null)
  // 记一笔：null = 没打开；preset = 从某家店点进来，直接预填
  const [compose, setCompose] = useState<{ preset: string | null } | null>(null)
  const [openCircle, setOpenCircle] = useState(false)
  const [circle, setCircle] = useState({ name: '', count: 0 })
  const [invite, setInvite] = useState<string | null>(() => captureInvite())
  const [toast, setToast] = useState<string | null>(null)

  const browse = useBrowse(authState === 'app', me?.circle_id, me?.username)
  const { newPoiIds, markSeen } = useActivity(browse.points, me?.username, me?.circle_id)

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

  // 当前圈的名字和我在几个圈：录入页要提醒记到哪、「我的」要显示
  const loadCircle = useCallback(() => {
    getCircles()
      .then((r) => setCircle({ name: r.circles.find((c) => c.id === r.active_circle_id)?.name || '', count: r.circles.length }))
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (authState === 'app') loadCircle()
  }, [authState, me?.circle_id, loadCircle])

  function flash(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 2200)
  }
  function switchTab(t: TabKey) {
    if (tab === 'list' && t !== 'list') markSeen() // 离开清单才算看过，新记录的红点这一趟都留着
    setTab(t)
  }
  function handleLoggedIn(user: MeInfo) {
    setMe(user)
    setAuthState('app')
  }
  function handleLogout() {
    clearToken()
    invalidatePoints()  // 别让下一个登录的人在 60s TTL 内闪到上个号的数据
    setMe(null)
    setAuthState('login')
    setTab('map')
  }
  function handleSubmitted(poiId?: string) {
    setCompose(null)
    browse.reload()
    if (poiId) setFocusPoiId(poiId) // 回地图飞到刚记的这家，点亮的一刻要看得见
    switchTab('map')
  }
  async function handleCircleChanged() {
    invalidatePoints()
    try {
      setMe(await getMe())
    } catch {
      /* ignore */
    }
    loadCircle()
    browse.reload()
  }
  function goInvite() {
    switchTab('me')
    setOpenCircle(true)
  }
  function showOnMap(poiId: string) {
    setFocusPoiId(poiId)
    switchTab('map')
  }
  const recordStore = (poiId: string) => setCompose({ preset: poiId })
  const openCompose = () => setCompose({ preset: null })

  async function acceptInvite(code: string) {
    clearInvite()
    setInvite(null)
    try {
      const r = await joinCircleApi(code)
      flash(r.already ? `你已经在「${r.name}」里了` : `已加入「${r.name}」`)
      await handleCircleChanged()
    } catch (e: any) {
      flash(e?.response?.data?.detail || '加入失败，邀请码可能过期了')
    }
  }

  if (authState === 'loading') {
    return (
      <Phone>
        <Splash />
      </Phone>
    )
  }

  if (authState === 'login' || !me) {
    return (
      <Phone>
        <LoginScreen onLoggedIn={handleLoggedIn} invited={!!invite} />
      </Phone>
    )
  }

  return (
    <Phone
      tab={tab}
      onTab={switchTab}
      onCompose={openCompose}
      listBadge={newPoiIds.size}
      overlay={
        <Presence show={!!compose}>
          {compose && (
            <AddScreen
              points={browse.points}
              presetPoiId={compose.preset}
              circleRole={me.circle_role}
              circleName={circle.count > 1 ? circle.name : undefined}
              onClose={() => setCompose(null)}
              onSubmitted={handleSubmitted}
            />
          )}
        </Presence>
      }
    >
      {tab === 'map' && (
        <Suspense fallback={<Splash hint="地图加载中…" />}>
          <MapScreen
            browse={browse}
            focusPoiId={focusPoiId}
            onConsumeFocus={() => setFocusPoiId(null)}
            onCompose={openCompose}
            onRecordStore={recordStore}
            onInvite={goInvite}
            myUsername={me.username}
            circleRole={me.circle_role}
          />
        </Suspense>
      )}
      {tab === 'list' && (
        <ListScreen
          browse={browse}
          newPoiIds={newPoiIds}
          onShowOnMap={showOnMap}
          onRecordStore={recordStore}
          onCompose={openCompose}
          onInvite={goInvite}
          myUsername={me.username}
          circleRole={me.circle_role}
        />
      )}
      {tab === 'me' && (
        <MeScreen
          me={me}
          points={browse.points}
          circleName={circle.name}
          circleCount={circle.count}
          onLogout={handleLogout}
          onCircleChanged={handleCircleChanged}
          autoOpenCircle={openCircle}
          onCircleOpened={() => setOpenCircle(false)}
        />
      )}
      <Presence show={!!invite}>
        {invite && (
          <SheetShell
            onClose={() => {
              clearInvite()
              setInvite(null)
            }}
          >
            <div className="text-center pt-1">
              <div className="text-5xl mb-3">🥢</div>
              <p className="text-xl font-bold tracking-tight">饭搭子邀请你一起记</p>
              <p className="text-sm text-on-surface-variant mt-1 mb-6">
                邀请码 <span className="font-num font-semibold tracking-wider">{invite}</span>，加入后就能看到这个圈的地图
              </p>
            </div>
            <Button full onClick={() => acceptInvite(invite)}>
              加入这个圈子
            </Button>
          </SheetShell>
        )}
      </Presence>
      <Toast message={toast} />
    </Phone>
  )
}

type PhoneProps = Readonly<{
  children: React.ReactNode
  tab?: TabKey
  onTab?: (t: TabKey) => void
  onCompose?: () => void
  listBadge?: number
  /** 盖在导航之上的全屏层（记一笔） */
  overlay?: React.ReactNode
}>

/** 手机视口外壳：居中、限宽；切 Tab 时内容淡入上浮；底部悬浮共享导航 */
function Phone({ children, tab, onTab, onCompose, listBadge, overlay }: PhoneProps) {
  return (
    <div className="h-[100dvh] w-full max-w-[440px] mx-auto flex flex-col overflow-hidden paper relative md:shadow-float">
      <main key={tab} className="flex-1 min-h-0 relative overflow-hidden animate-screen-in">
        {children}
      </main>
      {tab && onTab && onCompose && <TabBar active={tab} onChange={onTab} onCompose={onCompose} listBadge={listBadge} />}
      {overlay}
      <Lightbox />
    </div>
  )
}

/** 启动 / 懒加载占位：字标轻轻呼吸 */
function Splash({ hint }: { hint?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3">
      <div className="animate-bob">
        <Wordmark className="text-4xl" />
      </div>
      {hint && <div className="text-sm text-on-surface-variant animate-fade-in">{hint}</div>}
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
  return (
    <Presence show={!!src} duration={220}>
      {src && <LightboxView src={src} onClose={() => setSrc(null)} />}
    </Presence>
  )
}

function LightboxView({ src, onClose }: { src: string; onClose: () => void }) {
  const leaving = useContext(PresenceLeaving)
  useBackClose(!leaving, onClose)
  return (
    <div
      className={`fixed inset-0 z-lightbox bg-[#140e09]/90 flex flex-col items-center justify-center gap-4 p-4 ${
        leaving ? 'animate-fade-out pointer-events-none' : 'animate-fade-in'
      }`}
      style={{ WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <img src={src} alt="大图" className={`max-w-full max-h-[80vh] rounded-2xl shadow-float ${leaving ? '' : 'animate-pop-in'}`} />
      <div className="text-white/60 text-sm">轻点任意处关闭</div>
    </div>
  )
}
