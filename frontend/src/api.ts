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
  mood_emoji: '😋' | '🤤' | '😂' | '😐' | null
  want_again: boolean | null
  source: string | null
  reason: string | null
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

export const search = (keywords: string, region = '重庆', location?: string) =>
  api.post<any[]>('/search', { keywords, region, location }).then(r => r.data)

export const parseText = (text: string) =>
  api.post<ParsedSentence>('/parse', { text }).then(r => r.data)

export const upsertStore = (poi: any) =>
  api.post('/store', { poi }).then(r => r.data)

export const addVisit = (data: any) =>
  api.post('/visit', data).then(r => r.data)

export const addWish = (data: any) =>
  api.post('/wish', data).then(r => r.data)

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
