# 部署到 NAS（fnOS） + ECS Caddy + frp

部署链路：

```
浏览器 → https://eat.cooky.wang (443)
        ↓
       ECS Caddy 反代 → 127.0.0.1:8765
        ↓
       ECS frps (监听 8765)
        ↓ frp 隧道
       NAS frpc
        ↓
       NAS Docker: food_map:8000
```

---

## 一、NAS 上跑 Docker（应用层）

### 1.1 准备代码

```bash
# 选一个目录，比如 /volume1/docker/food_map
cd /volume1/docker
git clone git@github.com:你的用户名/food_map.git
cd food_map
```

### 1.2 写 .env

```bash
cp .env.example .env
nano .env
```

填入：
- `AMAP_KEY`：高德 Web 服务 key
- `DEEPSEEK_KEY`：DeepSeek API key
- `JWT_SECRET`：随机一串（`python3 -c "import secrets; print(secrets.token_urlsafe(48))"` 生成）
- `INITIAL_ADMIN_USERNAME`：你的用户名（比如 `aric`）
- `INITIAL_ADMIN_PASSWORD`：管理员初始密码（**首次登录后立刻在"我"页面改掉**）

### 1.3 启动

```bash
docker compose up -d --build
docker compose logs -f food_map
```

第一次启动会看到 `✨ 已创建管理员: aric`，说明 admin 账号已就绪。

数据 + 照片落在 `./data/`（已映射到容器 `/data`）。

---

## 二、frpc 配置（NAS 上转发到 ECS）

打开 NAS 的 frpc 配置（具体路径看你现有 frpc 怎么装的，通常是 `frpc.toml` 或 `frpc.ini`），新增一段：

### TOML 格式

```toml
[[proxies]]
name = "food_map"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8765           # docker-compose.yml 里暴露的端口
remotePort = 8765          # frps（ECS）上要监听的端口
```

### INI 格式（旧版 frpc）

```ini
[food_map]
type = tcp
local_ip = 127.0.0.1
local_port = 8765
remote_port = 8765
```

然后 `systemctl restart frpc` 或者 `docker restart frpc`，看你怎么装的。

---

## 三、ECS Caddy 配置（HTTPS + 反代）

打开 ECS 的 Caddyfile（`/etc/caddy/Caddyfile`），加一段：

```caddyfile
eat.cooky.wang {
    # 自动 Let's Encrypt 证书
    reverse_proxy 127.0.0.1:8765 {
        # 大上传文件支持（拍照）
        transport http {
            read_timeout 60s
        }
    }
}
```

然后 reload：

```bash
sudo systemctl reload caddy
# 或 caddy reload --config /etc/caddy/Caddyfile
```

Caddy 会自动申请 Let's Encrypt 证书（已备案的域名，秒过）。

---

## 四、首次登录

打开 https://eat.cooky.wang ——应该看到登录页。

1. 用 `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` 登录
2. 进入"我"页面 → **立刻改密码**
3. 在"管理用户"区添加饼饼的账号
4. 告诉饼饼用户名 + 密码，让她也登录

---

## 五、日常维护

```bash
# 拉新代码后重启
git pull
docker compose up -d --build

# 看日志
docker compose logs -f food_map

# 备份数据（NAS 自带快照就够，但也可以手动）
tar czf food_map-backup-$(date +%Y%m%d).tar.gz data/
```

---

## 六、踩坑提示

| 现象 | 原因 / 解决 |
|---|---|
| 登录后 401 / 反复跳登录 | 检查 ECS Caddy 是否正确 reverse_proxy；JWT_SECRET 不能动（变了所有 token 失效） |
| 拍照上传 413 | Caddy 加 `request_body { max_size 20MB }` |
| 高德 marker 不显示 | 服务器出口 IP 没在高德 key 白名单里——高德控制台改"IP 白名单"或设为空 |
| 手机定位被拒 | 必须 HTTPS（你已经有了）；用户首次进入页面浏览器会弹授权框 |

---

## 七、HTTPS / 安全

- JWT 默认 30 天有效
- 密码 bcrypt 哈希存储
- `.env` 别提交 Git（已加入 .gitignore）
- 上线后**立刻改 admin 初始密码**
- 想关闭注册：保持不动——本来就只有 admin 能创建用户
