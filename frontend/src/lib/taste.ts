// 口味词表 + dishes 编解码。词表与后端 ai.py 的 CUISINE_VOCAB / FLAVOR_VOCAB 保持一致（两端各一份，改要一起改）。

export const CUISINES = [
  '火锅', '川菜', '江湖菜', '串串香', '烧烤', '小吃', '面食', '粤菜', '湘菜', '西北菜',
  '云南菜', '日料', '韩餐', '西餐', '东南亚菜', '海鲜', '自助', '快餐', '面包烘焙',
  '咖啡', '甜品', '饮品',
] as const

export const FLAVORS = ['辣', '麻', '甜', '酸', '咸', '鲜', '清淡', '油', '烫', '冰'] as const

export type DishVerdict = '赞' | '雷' | null

export interface Dish {
  name: string
  verdict: DishVerdict
}

/** 解析 dishes：接受存储串「毛肚:赞,肥肠:雷,鸭肠」或编码数组 ["毛肚:赞","鸭肠"]。
 *  历史数据是纯菜名（无 verdict）→ verdict=null。 */
export function parseDishes(raw: string | string[] | Dish[] | undefined | null): Dish[] {
  if (!raw) return []
  const items = Array.isArray(raw) ? raw : raw.split(/[,，、]/)
  const out: Dish[] = []
  for (const it of items) {
    if (typeof it === 'object' && it !== null) {
      const name = (it.name || '').trim()
      if (name) out.push({ name, verdict: it.verdict === '赞' || it.verdict === '雷' ? it.verdict : null })
      continue
    }
    const s = String(it).trim()
    if (!s) continue
    const [name, verdict] = s.split(/[:：]/)
    const n = (name || '').trim()
    if (!n) continue
    out.push({ name: n, verdict: verdict === '赞' || verdict === '雷' ? verdict : null })
  }
  return out
}

/** 编码成提交格式 ["毛肚:赞","肥肠:雷","鸭肠"]（后端逗号拼接落库）。分隔符是保留字，从菜名里剔除。 */
export function encodeDishes(dishes: Dish[]): string[] {
  return dishes
    .map((d) => ({ ...d, name: d.name.replace(/[,:，：、]/g, '').trim() }))
    .filter((d) => d.name)
    .map((d) => (d.verdict ? `${d.name}:${d.verdict}` : d.name))
}

export function dishLabel(d: Dish): string {
  return d.verdict === '赞' ? `👍 ${d.name}` : d.verdict === '雷' ? `👎 ${d.name}` : d.name
}
