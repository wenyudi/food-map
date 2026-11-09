import { createContext } from 'react'

/** 子树是否处于「正在离场」：SheetShell / Toast 等读它来播退出动画、屏蔽点击 */
export const PresenceLeaving = createContext(false)
