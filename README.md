# 饼饼の美食地图

自用的美食日记 + 地图点位记录。和女朋友一起的吃饭回忆。

## 功能

- 🗺️ 高德地图标注 + 自动按距离搜索附近 POI
- ✏️ 一句话录入（DeepSeek 自动解析意图：吃过 / 种草）
- 🤍 种草 → ✨ 兑现 的店铺状态流转
- 📷 拍照 / 选图，前端自动压缩上传
- 📊 月度小结 + AI 写的回忆录
- 👤 双用户共享（你 + 饼饼），登录后看同一份数据
- 📍 浏览器定位（需 HTTPS）

## 技术栈

- **后端**：FastAPI + SQLite + JWT
- **前端**：React + Vite + leaflet + 高德矢量瓦片
- **AI**：DeepSeek（一句话解析 + 月度回忆录生成）
- **POI**：高德 Web 服务 API v5
- **部署**：Docker compose + ECS Caddy + frp 内网穿透

## 本地开发

```bash
# 后端
cp .env.example .env       # 填入 key
pip install -r requirements.txt
python server.py           # http://localhost:8000

# 前端（另一个终端）
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## 部署

见 [DEPLOY.md](./DEPLOY.md)。

## 也有命令行版（B 方案）

```bash
python cli.py say "昨晚和饼饼去格特士吃了200"
python cli.py wish
python cli.py map
python cli.py ls
```
