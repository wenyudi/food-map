import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'  // 本地打包，不依赖 unpkg CDN（国内更可靠）
import './index.css'               // 放 leaflet 之后，保证我们的样式覆盖生效
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
