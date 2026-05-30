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
  role: 'admin' | 'user'
}
export interface LoginResp extends MeInfo {
  token: string
}

export const login = (username: string, password: string) =>
  api.post<LoginResp>('/auth/login', { username, password }).then(r => r.data)

export const register = (username: string, password: string, invite_code: string) =>
  api.post<LoginResp>('/auth/register', { username, password, invite_code }).then(r => r.data)

export const getMe = () => api.get<MeInfo>('/auth/me').then(r => r.data)

export const changePassword = (old_password: string, new_password: string) =>
  api.post('/auth/change-password', { old_password, new_password }).then(r => r.data)

export interface UserItem {
  id: number
  username: string
  role: string
  created_at: string
}

export const listUsers = () => api.get<UserItem[]>('/auth/users').then(r => r.data)

export const createUserApi = (username: string, password: string, role = 'user') =>
  api.post('/auth/users', { username, password, role }).then(r => r.data)

export const deleteUserApi = (username: string) =>
  api.delete(`/auth/users/${encodeURIComponent(username)}`).then(r => r.data)

export interface InviteCode {
  code: string
  created_by: string | null
  circle_id: number | null   // null = 注册时新建独立圈子（给朋友）；否则加入该圈子
  created_at: string
  used_by: string | null
  used_at: string | null
}

// new_circle=true → 给朋友新建独立圈子（仅管理员）；false → 邀请进自己的圈子
export const genInvite = (new_circle = false) =>
  api.post<{ code: string }>('/auth/invites', { new_circle }).then(r => r.data)
export const listInvites = () => api.get<InviteCode[]>('/auth/invites').then(r => r.data)
export const revokeInvite = (code: string) =>
  api.delete(`/auth/invites/${encodeURIComponent(code)}`).then(r => r.data)

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
}

export interface Point {
  poi_id: string
  name: string
  lng: number
  lat: number
  address: string
  business_area: string
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
  // AI 隐形维度
  cuisine?: string | null
  flavors?: string[] | null
  dishes?: string[] | null
  occasion?: string | null
}

export interface Stats {
  total_visits: number
  total_amount: number
  total_stores_visited: number
  total_wishes_open: number
}

export const getPoints = () => api.get<Point[]>('/points').then(r => r.data)
export const getRecent = (limit = 20) => api.get<Visit[]>('/recent', { params: { limit } }).then(r => r.data)
export const getWishes = () => api.get<Wish[]>('/wishes').then(r => r.data)
export const getStats = () => api.get<Stats>('/stats').then(r => r.data)

// 只清空"我"记录的数据（同伴的保留）
export const resetMine = () =>
  api.post<{ ok: boolean; visits: number; wishes: number }>('/reset-mine').then(r => r.data)

// 导出本圈子全部数据（留底备份）
export const exportData = () => api.get<any>('/export').then(r => r.data)

export const search = (keywords: string, region = '重庆', location?: string) =>
  api.post<any[]>('/search', { keywords, region, location }).then(r => r.data)

// 反向地理编码：lng,lat → 城市（录入页按定位自动填城市）
export const regeo = (location: string) =>
  api.get<{ city: string; district: string; province: string }>('/regeo', { params: { location } }).then(r => r.data)

export const parseText = (text: string) =>
  api.post<ParsedSentence>('/parse', { text }).then(r => r.data)

export const upsertStore = (poi: any) =>
  api.post('/store', { poi }).then(r => r.data)

export const addVisit = (data: any) =>
  api.post('/visit', data).then(r => r.data)

export const addWish = (data: any) =>
  api.post('/wish', data).then(r => r.data)

// 编辑 / 删除单条记录
export const updateVisit = (visitId: string, data: any) =>
  api.patch(`/visit/${visitId}`, data).then(r => r.data)
export const deleteVisit = (visitId: string) =>
  api.delete(`/visit/${visitId}`).then(r => r.data)
export const updateWish = (wishId: string, data: any) =>
  api.patch(`/wish/${wishId}`, data).then(r => r.data)
export const deleteWish = (wishId: string) =>
  api.delete(`/wish/${wishId}`).then(r => r.data)

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
