/** 心情表情统一词表（记一笔 / 编辑 / 列表筛选共用，避免三处各写一份、日久漂移） */
export type Mood = '😋' | '🤤' | '😂' | '😐' | '🤮'

export const MOODS: Mood[] = ['😋', '🤤', '😂', '😐', '🤮']

export const MOOD_LABEL: Record<Mood, string> = {
  '😋': '太好吃',
  '🤤': '好吃',
  '😂': '一般',
  '😐': '不咋地',
  '🤮': '踩雷',
}

/** 选中那颗的入场动效（class 在 tailwind.css 里定义） */
export const MOOD_ANIM: Record<Mood, string> = {
  '😋': 'm-yum',
  '🤤': 'm-drool',
  '😂': 'm-laugh',
  '😐': 'm-meh',
  '🤮': 'm-vomit',
}
