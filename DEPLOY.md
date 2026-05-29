# 部署：直接跑在阿里云 ECS

当前方案——**直接在 ECS（<你的ECS-IP>）上跑 Docker，HTTP 端口访问**。
不碰现有 Caddy / frp，后面想要 HTTPS + 域名再加（见文末「升级到 HTTPS」）。

```
浏览器 → http://<你的ECS-IP>:8765  (或 http://<你的域名>:8765)
        ↓
       ECS Docker: food_map 容器 (8765→8000)
        ↓
       SQLite + photos  (./data 持久化)
```

---

## 一、把代码拉到 ECS

```bash
ssh root@<你的ECS-IP>            # 或你的 22 端口
cd /opt                           # 选个目录
# 国内服务器走代理 clone（repo 已公开）
git clone https://ghfast.top/https://github.com/wenyudi/food-map.git food-map
cd food-map
```

> 代理偶尔会失效，挂了换 `gh-proxy.com` 或 `ghproxy.net`。
> 想直连 `git clone https://github.com/...` 在国内 ECS 上一般会超时。

---

## 二、配 .env

```bash
cp .env.example .env
vi .env
```

填这几项：

| 变量 | 填什么 |
|---|---|
| `AMAP_KEY` | 高德 Web 服务 key |
| `DEEPSEEK_KEY` | DeepSeek API key |
| `JWT_SECRET` | 随机串：`python3 -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `INITIAL_ADMIN_USERNAME` | 你的用户名，比如 `aric` |
| `INITIAL_ADMIN_PASSWORD` | 初始密码（**首次登录后立刻改**） |

---

## 三、启动（二选一）

### 方式 A：Docker（推荐，ECS 装了 Docker 的话）

```bash
docker compose up -d --build
docker compose logs -f food_map      # 看到「✨ 已创建管理员」就成
```

容器把 `8765` 映射到内部 `8000`，数据落在 `./data/`。

### 方式 B：裸跑 Python + systemd（没装 Docker）

```bash
# 装 Python 依赖
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 编前端（需要 Node 20+）
cd frontend && npm install && npm run build && cd ..

# 手动起一次确认能跑
PORT=8765 python server.py
# Ctrl-C 后写 systemd（见文末附录）
```

---

## 四、开放端口

阿里云控制台 → ECS 实例 → **安全组** → 添加入方向规则：
- 协议 TCP，端口 `8765`，授权对象 `0.0.0.0/0`

如果 ECS 上还跑着 `ufw` / `firewalld`：
```bash
ufw allow 8765/tcp        # ufw
# 或
firewall-cmd --add-port=8765/tcp --permanent && firewall-cmd --reload
```

---

## 五、访问 + 首次登录

浏览器打开 `http://<你的ECS-IP>:8765`（或 `http://<你的域名>:8765`）：

1. 用 `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` 登录
2. 进「我」页面 → **立刻改密码**
3. 在「管理用户」区添加饼饼的账号
4. 把用户名密码告诉饼饼

---

## ⚠️ HTTP 模式的一个限制

浏览器规定：**非 HTTPS 页面拿不到地理定位**（localhost 例外）。所以 HTTP 部署下：
- ❌ 手机上「我在哪儿」按钮、「附近优先搜索」用不了（会 fallback 到城市搜索，仍能用）
- ✅ 拍照上传、AI 录入、地图、列表、回忆录 全部正常

想让手机定位也能用 → 上 HTTPS，见下。

---

## 升级到 HTTPS（想要时再做，3 行）

你 ECS 上的 Caddy 已经在跑了，加一段路由即可，不用动别的：

```caddyfile
# /etc/caddy/Caddyfile 追加
<你的域名> {
    reverse_proxy 127.0.0.1:8765
    request_body { max_size 25MB }
}
```

```bash
sudo systemctl reload caddy
```

然后把 docker-compose.yml 的端口映射改成 `127.0.0.1:8765:8000`（只让 Caddy 访问，不再裸暴露），重启容器。访问 https://<你的域名> 就有证书 + 手机定位了。

---

## 日常维护

```bash
git pull
docker compose up -d --build        # Docker
# 或 systemctl restart food_map     # 裸跑

# 备份数据
tar czf food_map-$(date +%Y%m%d).tar.gz data/
```

---

## 附录：systemd unit（裸跑方式 B 用）

`/etc/systemd/system/food_map.service`：

```ini
[Unit]
Description=food_map
After=network.target

[Service]
WorkingDirectory=/opt/food-map
EnvironmentFile=/opt/food-map/.env
ExecStart=/opt/food-map/venv/bin/uvicorn server:app --host 0.0.0.0 --port 8765 --proxy-headers
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now food_map
systemctl status food_map
```
