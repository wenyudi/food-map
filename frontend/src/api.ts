import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 30000 })

const TOKEN_KEY = 'food_map_token'

export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken() { localStorage.removeItem(TOKEN_KEY) }

// 请求拦截：自动加 Bearer token
api.interceptors.request.use(config => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截：401 自动登出并刷新页面（回到登录页）
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 && getToken()) {
      clearToken()
      window.location.reload()
    }
    return Promise.reject(err)
  },
)

// 认证接口
export interface MeInfo {
  username: string
  nickname: string
  role: 'admin' | 'user'
  circle_id?: number
  circle_role?: 'owner' | 'editor' | 'viewer'
}
export interface LoginResp extends MeInfo {
  token: string
}

export const login = (email: string, password: string) =>
  api.post<LoginResp>('/auth/login', { email, password }).then(r => r.data)

export const register = (email: string, code: string, password: string, nickname: string) =>
  api.post<LoginResp>('/auth/register', { email, code, password, nickname }).then(r => r.data)

export const sendCode = (email: string, purpose: 'register' | 'reset') =>
  api.post<{ ok: boolean; cooldown: number; dev_mode: boolean }>('/auth/send-code', { email, purpose }).then(r => r.data)

export const resetPassword = (email: string, code: string, new_password: string) =>
  api.post<{ ok: boolean }>('/auth/reset-password', { email, code, new_password }).then(r => r.data)

// ---------- 圈子 ----------
export type CircleRole = 'owner' | 'editor' | 'viewer'
export interface CircleBrief {
  id: number
  name: string
  owner_username: string
  role: CircleRole
  member_count: number
}
export interface CircleMember {
  username: string
  nickname?: string
  role: CircleRole
  joined_at: string
  email?: string
}
export const getCircles = () =>
  api.get<{ active_circle_id: number; circles: CircleBrief[] }>('/circles').then(r => r.data)
export const createCircleApi = (name: string) =>
  api.post<{ circle_id: number; name: string }>('/circles', { name }).then(r => r.data)
export const switchCircleApi = (circle_id: number) =>
  api.post<{ ok: boolean; active_circle_id: number }>('/circles/switch', { circle_id }).then(r => r.data)
export const joinCircleApi = (code: string) =>
  api.post<{ ok: boolean; circle_id: number; name: string; role?: CircleRole; already?: boolean }>('/circles/join', { code }).then(r => r.data)
export const getMembers = (cid: number) =>
  api.get<{ name: string; owner: string; my_role: CircleRole; members: CircleMember[] }>(`/circles/${cid}/members`).then(r => r.data)
export const createInviteApi = (cid: number, role: 'editor' | 'viewer', expires_hours = 24, max_uses?: number | null) =>
  api.post<{ code: string; role: CircleRole; expires_at: string; max_uses: number | null }>(`/circles/${cid}/invites`, { role, expires_hours, max_uses }).then(r => r.data)
export const renameCircleApi = (cid: number, name: string) =>
  api.patch<{ ok: boolean; name: string }>(`/circles/${cid}`, { name }).then(r => r.data)
export const setMemberRoleApi = (cid: number, username: string, role: 'editor' | 'viewer') =>
  api.patch(`/circles/${cid}/members/${encodeURIComponent(username)}`, { role }).then(r => r.data)
export const removeMemberApi = (cid: number, username: string) =>
  api.delete(`/circles/${cid}/members/${encodeURIComponent(username)}`).then(r => r.data)
export const transferOwnerApi = (cid: number, username: string) =>
  api.post(`/circles/${cid}/transfer`, { target: username }).then(r => r.data)
export const disbandCircleApi = (cid: number) =>
  api.delete(`/circles/${cid}`).then(r => r.data)

export const getMe = () => api.get<MeInfo>('/auth/me').then(r => r.data)

export const changePassword = (old_password: string, new_password: string) =>
  api.post('/auth/change-password', { old_password, new_password }).then(r => r.data)

export interface Visit {
  visit_id: string
  poi_id: string
  date: string
  meal_period: string
  amount: number
  people_count: number
  per_person: number
  mood_emoji: string
  want_again: number
  feeling: string
  companions: string
  value_label: string
  amap_cost_ref: string
  wish_id: string
  my_photos: string  // | 分隔的 URL
  created_at: string
  recorded_by?: string
  recorded_by_name?: string
  cuisine?: string
  flavors?: string
  dishes?: string
  occasion?: string
  store_name?: string
  store_tag?: string
  business_area?: string
}

export interface Wish {
  wish_id: string
  poi_id: string
  store_hint: string
  source: string
  reason: string
  status: string
  created_at: string
  visited_at?: string
  store_name?: string
  store_tag?: string
  business_area?: string
  lng?: number
  lat?: number
  recorded_by?: string
  recorded_by_name?: string
  cuisine?: string
}

export interface Point {
  poi_id: string
  name: string
  lng: number
  lat: number
  address: string
  business_area: string
  district?: string
  city?: string
  tag: string
  rating: string
  cost: string
  opentime: string
  amap_photos: string
  status: 'visited' | 'want'
  color: string
  emoji: string
  visit_count: number
  visits: Visit[]
  wish: Wish | null
}

export interface ParsedSentence {
  intent: 'visit' | 'wish'
  store_hint: string
  date: string | null
  meal_period: '早' | '中' | '晚' | null
  companions: string | null
  amount: number | null
  people_count: number | null
  feeling: string | null
  mood_emoji: '😋' | '🤤' | '😂' | '😐' | '🤮' | null
  want_again: boolean | null
  source: string | null
  reason: string | null
  // AI 隐形维度（dishes 自解析升级后带赞/雷评价）
  cuisine?: string | null
  flavors?: string[] | null
  dishes?: { name: string; verdict: '赞' | '雷' | null }[] | null
  occasion?: string | null
}

export interface Stats {
  total_visits: number
  total_amount: number
  total_stores_visited: number
  total_wishes_open: number
}

// /points 是全量数据，地图/列表/记一笔/我的四个屏都读它。加个短 TTL 缓存：
// 秒级快速切 Tab 直接命中缓存、不重复打全量请求；任何写操作都会 invalidate，保证读到最新。
let _pointsCache: { at: number; data: Point[] } | null = null
let _pointsInflight: Promise<Point[]> | null = null
const POINTS_TTL = 60_000

export const getPoints = (): Promise<Point[]> => {
  if (_pointsCache && Date.now() - _pointsCache.at < POINTS_TTL) {
    return Promise.resolve(_pointsCache.data)
  }
  if (_pointsInflight) return _pointsInflight // 合并并发：多处同时取只打一次
  _pointsInflight = api
    .get<Point[]>('/points')
    .then((r) => {
      _pointsCache = { at: Date.now(), data: r.data }
      _pointsInflight = null
      return r.data
    })
    .catch((e) => {
      _pointsInflight = null // 失败别缓存，下次重试
      throw e
    })
  return _pointsInflight
}

/** 任何会改动 /points 的写操作后调用，让下次 getPoints 重新拉取 */
export const invalidatePoints = () => {
  _pointsCache = null
  _pointsInflight = null
}

export const getStats = () => api.get<Stats>('/stats').then(r => r.data)

// 只清空"我"记录的数据（圈友的保留）
export const resetMine = () =>
  api.post<{ ok: boolean; visits: number; wishes: number }>('/reset-mine').then(r => { invalidatePoints(); return r.data })

// 导出本圈子全部数据（留底备份）
export const exportData = () => api.get<any>('/export').then(r => r.data)

export const search = (keywords: string, region = '重庆', location?: string, mode?: 'name') =>
  api.post<any[]>('/search', { keywords, region, location, mode }).then(r => r.data)

// inputtips 候选没有评分/人均/营业时间——选中时按 id 补一次详情
export const poiDetail = (poiId: string) =>
  api.get<any>(`/poi/${encodeURIComponent(poiId)}`).then(r => r.data)

// 反向地理编码：lng,lat → 城市（录入页按定位自动填城市）
export const regeo = (location: string) =>
  api.get<{ city: string; district: string; province: string }>('/regeo', { params: { location } }).then(r => r.data)

export const parseText = (text: string) =>
  api.post<ParsedSentence>('/parse', { text }).then(r => r.data)

// 照片上传：必须走带 token 拦截器的 api 实例（/api/upload 需要鉴权）
export const uploadPhoto = (form: FormData) =>
  api.post<{ url: string }>('/upload', form).then(r => r.data)

export const upsertStore = (poi: any) =>
  api.post('/store', { poi }).then(r => r.data)

export const addVisit = (data: any) =>
  api.post('/visit', data).then(r => { invalidatePoints(); return r.data })

export const addWish = (data: any) =>
  api.post('/wish', data).then(r => { invalidatePoints(); return r.data })

// 编辑 / 删除单条记录（写完都让 points 缓存失效，下次读最新）
export const updateVisit = (visitId: string, data: any) =>
  api.patch(`/visit/${visitId}`, data).then(r => { invalidatePoints(); return r.data })
export const deleteVisit = (visitId: string) =>
  api.delete(`/visit/${visitId}`).then(r => { invalidatePoints(); return r.data })
export const updateWish = (wishId: string, data: any) =>
  api.patch(`/wish/${wishId}`, data).then(r => { invalidatePoints(); return r.data })
export const deleteWish = (wishId: string) =>
  api.delete(`/wish/${wishId}`).then(r => { invalidatePoints(); return r.data })

// 店选错了：把这条记录/想去搬到另一家店（传高德 poi 原始字典，后端 upsert 后换绑）
export const rebindVisit = (visitId: string, poi: any) =>
  api.post(`/visit/${visitId}/rebind`, { poi }).then(r => { invalidatePoints(); return r.data })
export const rebindWish = (wishId: string, poi: any) =>
  api.post(`/wish/${wishId}/rebind`, { poi }).then(r => { invalidatePoints(); return r.data })

export interface MonthlyStory {
  story: string
  cached?: boolean
  empty?: boolean
  year_month: string
}

export const getMonthlyStory = (year_month?: string, regenerate = false) =>
  api.get<MonthlyStory>('/monthly-story', {
    params: { year_month, regenerate: regenerate || undefined },
    timeout: 60000,  // AI 生成可能 2-5s
  }).then(r => r.data)

// 今天吃啥 · 决策助手
export interface SuggestPick {
  poi_id: string
  name: string
  kind: 'wish' | 'fav'
  reason: string
  has_coords: boolean
  open_now?: boolean | null
  opentime?: string
}
export interface Suggestion {
  note: string
  picks: SuggestPick[]
  empty?: boolean
}
export const getSuggest = (location?: string, craving?: string) =>
  api.get<Suggestion>('/suggest', {
    params: { location, craving },
    timeout: 40000,
  }).then(r => r.data)

// 问地图 · 自然语言问自己的记录
export const askMap = (q: string) =>
  api.post<{ answer: string }>('/ask', { q }, { timeout: 40000 }).then(r => r.data)

// 片区称号 · AI 给每个商圈取的江湖名号（按圈子缓存，可重摇）
export interface AreaTitle { title: string; blurb: string }
export interface AreaTitlesResp {
  areas: Record<string, AreaTitle>
  cached?: boolean
  empty?: boolean
}
export const getAreaTitles = (regenerate = false) =>
  api.get<AreaTitlesResp>('/area-titles', {
    params: { regenerate: regenerate || undefined },
    timeout: 50000,
  }).then(r => r.data)
