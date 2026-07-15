# 吃了么 · 美食地图 🍜

和女朋友 / 朋友一起的美食日记 —— 吃过的、想去的，都点亮在同一张地图上。
一句话就能记一顿，AI 帮你把它们串成回忆。

## 功能

**地图 & 片区**
- 🗺️ 高德地图点位，按距离自动搜附近 POI
- 🏆 **片区版图**：把散点聚成「商圈领地」，按里程碑（吃过 1 / 3 / 6 / 10 家）由 AI 给每个商圈取玩梗称号，配探索进度（吃过 vs 想去）
- 📍 浏览器定位 + 「我在哪儿」（需 HTTPS）

**记录**
- ✏️ 一句话录入，DeepSeek 自动解析「吃过 / 种草」以及金额、人数、心情…
- 🔍 店名直搜录入：选好「吃过 / 想去」直接搜店名——自己记过的店（含手动加的）置顶秒出；AI 选错店时「换一家」也能就地改词重搜
- 🤍 种草 → ✨ 兑现 的状态流转
- 📷 拍照 / 选图，前端自动压缩上传
- 😋 口味飞轮：录入时悄悄提取 菜系 / 口味 / 菜品（带 👍赞 / 👎雷）/ 场合，喂给下面所有 AI 节点；标签抽错可以在解析页和编辑弹窗里改
- 📝 长评论不压缩：点评保留你的原话（AI 只摘录、不改写），录入框 500 字内怎么写都行

**AI 助手**
- 🍽️ 今天吃啥：按口味、时段、位置帮你拍板
- 🔮 问地图：用大白话问自己的记录（「我们爱吃辣吗」「哪家有水煮鱼」）
- 📊 月度小结 + AI 回忆录
- 📖 美食回忆报告（翻页故事卡）

**协作 & 数据**
- 👤 圈子隔离：你和 TA 共享同一份数据，邀请码注册
- 🔍 列表搜索 + 「想再来」筛选 + 作者标记
- 🎉 里程碑撒花 · 就在附近 · 同伴动态提醒
- 📦 数据备份导出 / 只清理我的记录 / 分享店名
- 📲 PWA，可装到手机主屏、断网也能翻历史

## 技术栈

- **后端**：FastAPI · SQLite · JWT（bcrypt + PyJWT）
- **前端**：React + Vite + TypeScript · react-leaflet + 高德矢量瓦片（GCJ-02）· PWA
- **AI**：DeepSeek（deepseek-chat）—— 一句话解析 / 今天吃啥 / 问地图 / 月度回忆 / 片区称号 多节点
- **地图数据**：高德 Web 服务 API v5（POI 2.0 + regeo 反向地理编码）
- **部署**：Docker Compose · ECS（可选 Caddy 上 HTTPS）

> 数据隔离：store（POI）全局共享，visit / wish 按 `circle_id`（圈子）隔离 —— 每对情侣 / 每群朋友各看各的。

## 本地开发

```bash
# 后端
cp .env.example .env       # 填 AMAP_KEY / DEEPSEEK_KEY / JWT_SECRET / 初始管理员
pip install -r requirements.txt
python server.py           # http://localhost:8000

# 前端（另一个终端）
cd frontend
npm install
npm run dev                # http://localhost:5173
```

## 部署

直接跑在 ECS 上的 Docker，详见 [DEPLOY.md](./DEPLOY.md)。日常更新：

```bash
git pull && docker compose up -d --build
```
