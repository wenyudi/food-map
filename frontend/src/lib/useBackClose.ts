import { useEffect, useRef } from 'react'

// 手机返回键 / 手势返回 / Esc 关最上面那层（抽屉、全屏录入、大图、门店卡），而不是直接退出 PWA。
//
// 不管开了几层，历史里最多压一条占位（guard）：
// 按返回吃掉占位 → 关最上面一层 → 还有层开着就补回占位；全关完了再把占位退掉。
// 开关层都合并到下一拍再同步，因为 history.back() 是异步的：
// 「关 A 同时开 B」时如果当场 back + push，后退会多走一步，直接退出 app。

type Entry = { onBack: () => void }

const stack: Entry[] = []
let guard = false
let ignorePops = 0 // 自己调 history.back() 触发的 popstate，不算用户按返回
let timer: number | undefined
let listening = false

function sync() {
  if (stack.length > 0 && !guard) {
    history.pushState({ layer: 1 }, '')
    guard = true
  } else if (stack.length === 0 && guard) {
    guard = false
    ignorePops++
    history.back()
  }
}

function schedule() {
  clearTimeout(timer)
  timer = window.setTimeout(sync, 30)
}

function listen() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', () => {
    if (ignorePops > 0) {
      ignorePops--
      return
    }
    guard = false
    stack[stack.length - 1]?.onBack()
    schedule() // 下面还有层，或这层没关（比如弹了「不记了？」）：把占位补回来
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') stack[stack.length - 1]?.onBack()
  })
}

export function useBackClose(active: boolean, onBack: () => void) {
  const latest = useRef(onBack)
  useEffect(() => {
    latest.current = onBack
  }, [onBack])

  useEffect(() => {
    if (!active) return
    listen()
    const entry: Entry = { onBack: () => latest.current() }
    stack.push(entry)
    schedule()
    return () => {
      stack.splice(stack.indexOf(entry), 1)
      schedule()
    }
  }, [active])
}
