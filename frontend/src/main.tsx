import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'  // 本地打包，不依赖 unpkg CDN（国内更可靠）
import './tailwind.css'            // Stitch 重建：Tailwind 入口（取代旧 index.css）
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 注册 Service Worker —— 可安装到主屏幕 + 断网可看（仅 https / localhost 生效）
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
