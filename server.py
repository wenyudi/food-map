"""饼饼の美食地图 · 后端 API（FastAPI）

启动：
  python server.py
  → http://0.0.0.0:8000        本机访问
  → http://192.168.x.x:8000    手机连同 WiFi 访问

接口：
  GET  /api/points         地图所有点位（stores + visits + wishes 合并）
  GET  /api/recent         最近 10 次访问
  GET  /api/wishes         未兑现的种草
  GET  /api/stats          总数统计
  POST /api/search         高德搜 POI（body: {keywords, region, location?}）
  POST /api/parse          DeepSeek 解析一句话（body: {text}）
  POST /api/visit          写入访问（body: {poi_id, date, meal_period, amount, ...}）
  POST /api/wish           写入种草（body: {poi_id, source, reason}）
  POST /api/store          根据 POI 字典 upsert 店铺，返回 store 全字段
"""
from __future__ import annotations

import os
import secrets
import socket
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

# 必须在 import ai / amap / db 之前加载 .env，否则它们读到空 key
from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import ai
import amap
import auth
import db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时确保有 admin 账号。"""
    admin_user = os.environ.get("INITIAL_ADMIN_USERNAME")
    admin_pass = os.environ.get("INITIAL_ADMIN_PASSWORD")
    if admin_user and admin_pass and not db.get_user(admin_user):
        cid = db.create_circle("默认圈子")
        db.create_user(admin_user, auth.hash_password(admin_pass), role="admin", circle_id=cid)
        print(f"  ✨ 已创建管理员: {admin_user}（圈子 #{cid}）")
    yield


app = FastAPI(title="吃了么 API", lifespan=lifespan)

PHOTOS_DIR = Path(os.environ.get("PHOTOS_DIR") or (Path(__file__).parent / "data" / "photos"))
PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/photos", StaticFiles(directory=PHOTOS_DIR), name="photos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- 认证依赖 ----------

def current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "请先登录")
    token = authorization[7:]
    payload = auth.decode_token(token)
    if not payload:
        raise HTTPException(401, "登录已过期，请重新登录")
    user = db.get_user(payload["username"])
    if not user:
        raise HTTPException(401, "用户不存在")
    return user


def require_admin(user: dict = Depends(current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "需要管理员权限")
    return user


# ---------- 认证接口 ----------

class LoginReq(BaseModel):
    username: str
    password: str


class CreateUserReq(BaseModel):
    username: str
    password: str
    role: str = "user"


class ChangePasswordReq(BaseModel):
    old_password: str
    new_password: str


class RegisterReq(BaseModel):
    username: str
    password: str
    invite_code: str


@app.post("/api/auth/login")
def post_login(req: LoginReq):
    user = db.get_user(req.username)
    if not user or not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "用户名或密码错误")
    token = auth.make_token(user["username"], user["role"])
    return {"token": token, "username": user["username"], "role": user["role"]}


@app.post("/api/auth/register")
def post_register(req: RegisterReq):
    code = req.invite_code.strip().upper()
    username = req.username.strip()
    inv = db.get_invite(code)
    if not inv:
        raise HTTPException(400, "邀请码无效")
    if inv.get("used_by"):
        raise HTTPException(400, "邀请码已被使用")
    if not username:
        raise HTTPException(400, "用户名不能为空")
    if db.get_user(username):
        raise HTTPException(400, "用户名已存在")
    if len(req.password) < 4:
        raise HTTPException(400, "密码至少 4 位")
    # 邀请码带圈子：None=新建独立圈子（给朋友），否则加入该圈子（情侣共享一张图）
    circle_id = inv.get("circle_id")
    if circle_id is None:
        circle_id = db.create_circle(username)
    db.create_user(username, auth.hash_password(req.password), role="user", circle_id=circle_id)
    db.mark_invite_used(code, username)
    token = auth.make_token(username, "user")
    return {"token": token, "username": username, "role": "user"}


class InviteReq(BaseModel):
    new_circle: bool = False  # True=新建独立圈子（仅管理员）；False=加入自己的圈子


@app.post("/api/auth/invites")
def gen_invite(req: InviteReq = InviteReq(), user: dict = Depends(current_user)):
    is_admin = user.get("role") == "admin"
    if req.new_circle and not is_admin:
        raise HTTPException(403, "只有管理员能创建「新圈子」邀请码")
    # 新圈子 → circle_id=None（注册时再建）；加入我的圈子 → 我的 circle_id
    circle_id = None if req.new_circle else user.get("circle_id")
    code = secrets.token_hex(4).upper()  # 8 位十六进制，比如 A1B2C3D4
    db.create_invite(code, user["username"], circle_id)
    return {"code": code}


@app.get("/api/auth/invites")
def get_invites(user: dict = Depends(current_user)):
    items = db.list_invites()
    if user.get("role") != "admin":
        # 普通用户只看自己生成的邀请码
        items = [i for i in items if i.get("created_by") == user["username"]]
    return items


@app.delete("/api/auth/invites/{code}")
def revoke_invite(code: str, user: dict = Depends(current_user)):
    inv = db.get_invite(code)
    if not inv:
        return {"ok": True}
    if user.get("role") != "admin" and inv.get("created_by") != user["username"]:
        raise HTTPException(403, "不能撤销别人的邀请码")
    if inv.get("used_by"):
        raise HTTPException(400, "已使用的邀请码不能删")
    db.delete_invite(code)
    return {"ok": True}


@app.get("/api/auth/me")
def get_me(user: dict = Depends(current_user)):
    return {"username": user["username"], "role": user["role"]}


@app.post("/api/auth/change-password")
def change_password(req: ChangePasswordReq, user: dict = Depends(current_user)):
    if not auth.verify_password(req.old_password, user["password_hash"]):
        raise HTTPException(400, "旧密码不对")
    db.update_user_password(user["username"], auth.hash_password(req.new_password))
    return {"ok": True}


@app.get("/api/auth/users")
def get_users(_: dict = Depends(require_admin)):
    return db.list_users()


@app.post("/api/auth/users")
def create_user_endpoint(req: CreateUserReq, _: dict = Depends(require_admin)):
    if db.get_user(req.username):
        raise HTTPException(400, "用户名已存在")
    if len(req.password) < 4:
        raise HTTPException(400, "密码至少 4 位")
    if req.role not in ("admin", "user"):
        raise HTTPException(400, "role 只能是 admin 或 user")
    db.create_user(req.username, auth.hash_password(req.password), req.role)
    return {"ok": True, "username": req.username}


@app.delete("/api/auth/users/{username}")
def delete_user_endpoint(username: str, admin: dict = Depends(require_admin)):
    if username == admin["username"]:
        raise HTTPException(400, "不能删除自己")
    db.delete_user(username)
    return {"ok": True}


# ---------- 请求/响应 模型 ----------

class SearchReq(BaseModel):
    keywords: str
    region: Optional[str] = "重庆"
    location: Optional[str] = None  # "lng,lat" 周边搜


class ParseReq(BaseModel):
    text: str


class StoreReq(BaseModel):
    poi: dict  # 高德返回的 poi 字典原样上传


class VisitReq(BaseModel):
    poi_id: str
    date: str
    meal_period: str
    amount: float
    people_count: int
    mood_emoji: str
    want_again: bool
    feeling: str = ""
    companions: str = ""
    my_photos: str = ""
    wish_id: str = ""


class WishReq(BaseModel):
    poi_id: str
    store_hint: str
    source: str = "小红书"
    reason: str = ""


# ---------- 查询接口 ----------

EMOJI_COLOR = {"😋": "#ff4757", "🤤": "#ffa502", "😂": "#7bed9f", "😐": "#a4b0be"}


@app.get("/api/points")
def get_points(user: dict = Depends(current_user)):
    data = db.load_all(user["circle_id"])
    stores = {s["poi_id"]: s for s in data["stores"]}
    visits_by_poi: dict[str, list] = {}
    for v in data["visits"]:
        visits_by_poi.setdefault(v["poi_id"], []).append(v)
    # 不过滤 status，让前端能看到已兑现的种草历史（用于时间线）
    wishes_by_poi: dict = {}
    for w in data["wishes"]:
        existing = wishes_by_poi.get(w["poi_id"])
        if not existing or (w.get("created_at", "") > existing.get("created_at", "")):
            wishes_by_poi[w["poi_id"]] = w

    points = []
    for poi_id, store in stores.items():
        if not store.get("lng") or not store.get("lat"):
            continue
        my_visits = visits_by_poi.get(poi_id, [])
        wish = wishes_by_poi.get(poi_id)
        # stores 表是全局 POI 缓存——本圈子既没去过也没种草的店，不该出现在地图上
        if not my_visits and not wish:
            continue
        latest = my_visits[-1] if my_visits else None
        emoji = (latest or {}).get("mood_emoji", "")
        points.append({
            **store,
            "status": "visited" if my_visits else "want",
            "color": EMOJI_COLOR.get(emoji, "#a4b0be"),
            "emoji": emoji or "🤍",
            "visit_count": len(my_visits),
            "visits": my_visits,
            "wish": wishes_by_poi.get(poi_id),
        })
    return points


@app.get("/api/recent")
def get_recent(limit: int = 10, user: dict = Depends(current_user)):
    return db.list_recent_visits(limit, user["circle_id"])


@app.get("/api/wishes")
def get_wishes(user: dict = Depends(current_user)):
    return db.list_open_wishes(user["circle_id"])


@app.get("/api/stats")
def get_stats(user: dict = Depends(current_user)):
    return db.stats(user["circle_id"])


# ---------- 写入接口 ----------

@app.post("/api/search")
def post_search(req: SearchReq, _: dict = Depends(current_user)):
    try:
        return amap.search_poi(req.keywords, region=req.region, location=req.location, limit=5)
    except RuntimeError as e:
        raise HTTPException(500, str(e))


@app.post("/api/parse")
def post_parse(req: ParseReq, _: dict = Depends(current_user)):
    try:
        return ai.parse_one_liner(req.text)
    except Exception as e:
        raise HTTPException(500, f"AI 解析失败：{e}")


@app.post("/api/store")
def post_store(req: StoreReq, _: dict = Depends(current_user)):
    """从前端搜索结果里挑了一家后，上传 poi 字典让后端 upsert 并返回标准化的 store。"""
    store = amap.poi_to_store(req.poi)
    db.upsert_store(store)
    return {**store.__dict__}


@app.post("/api/visit")
def post_visit(req: VisitReq, user: dict = Depends(current_user)):
    store_row = next((s for s in db.load_all()["stores"] if s["poi_id"] == req.poi_id), None)
    if not store_row:
        raise HTTPException(404, "POI 不在 stores 表里——先调 /api/store 入库")

    cost = store_row.get("cost", "")
    per_person = req.amount / req.people_count if req.people_count else 0

    # 核心联动：这家店本圈子之前种过草（status=want）→ 这次"吃过"自动兑现它，
    # 把"想去"翻成"已兑现"。前端没显式传 wish_id 时也能自动接上（一句话录入就是这种情况）。
    wish_id = req.wish_id
    if not wish_id:
        open_wish = db.find_open_wish_by_poi(req.poi_id, user["circle_id"])
        if open_wish:
            wish_id = open_wish["wish_id"]

    visit = db.Visit(
        poi_id=req.poi_id,
        date=req.date, meal_period=req.meal_period,
        amount=req.amount, people_count=req.people_count,
        mood_emoji=req.mood_emoji, want_again=req.want_again,
        feeling=req.feeling, companions=req.companions,
        my_photos=req.my_photos,
        amap_cost_ref=cost,
        value_label=db.compute_value_label(per_person, cost),
        wish_id=wish_id,
        recorded_by=user["username"],
        circle_id=user["circle_id"],
    )
    db.add_visit(visit)
    if wish_id:
        db.mark_wish_visited(wish_id, visit.visit_id)
    _invalidate_story_cache_for(req.date, user["circle_id"])

    return {
        "visit_id": visit.visit_id,
        "per_person": visit.per_person,
        "value_label": visit.value_label,
        "fulfilled_wish": bool(wish_id),  # 前端可据此提示"种草已兑现 ✨"
    }


# ---------- 月度回忆录（in-memory cache） ----------

_story_cache: dict[str, str] = {}  # key: f"{circle_id}:{yyyy-mm}"


def _story_key(circle_id: int, year_month: str) -> str:
    return f"{circle_id}:{year_month}"


def _invalidate_story_cache_for(date_str: str, circle_id: int) -> None:
    """visit/wish 写入时调用，按 圈子+yyyy-mm 失效缓存。"""
    if date_str and len(date_str) >= 7:
        _story_cache.pop(_story_key(circle_id, date_str[:7]), None)


def _build_story_brief(year_month: str, circle_id: int) -> Optional[str]:
    """把当月数据整理成给 AI 看的 markdown 清单。没数据返回 None。"""
    data = db.load_all(circle_id)
    stores = {s["poi_id"]: s for s in data["stores"]}
    wishes_by_visit = {w["visit_id"]: w for w in data["wishes"] if w.get("visit_id")}

    month_visits = [v for v in data["visits"] if (v.get("date") or "").startswith(year_month)]
    if not month_visits:
        return None

    # 按时间排序
    month_visits.sort(key=lambda v: (v.get("date") or "", v.get("created_at") or ""))

    # 按 poi 聚合检测复访
    visit_count_by_poi: dict[str, int] = {}
    for v in month_visits:
        visit_count_by_poi[v["poi_id"]] = visit_count_by_poi.get(v["poi_id"], 0) + 1

    lines = [f"# {year_month} 本月吃过的店（按时间）"]
    for i, v in enumerate(month_visits, 1):
        s = stores.get(v["poi_id"], {})
        w = wishes_by_visit.get(v["visit_id"])
        bits = [
            f"{i}. **{s.get('name', '?')}** [{s.get('tag') or '-'}]",
            f"   - {v['date']} {v['meal_period']}, 和{v['companions']}, ¥{v['per_person']}/人",
            f"   - 评价 {v['mood_emoji']} {'⭐想再来 ' if v['want_again'] else ''}\"{v['feeling'] or '无'}\"",
        ]
        if v.get("value_label"):
            bits.append(f"   - 💰 {v['value_label']}")
        if v.get("wish_id") and w:
            bits.append(f"   - ✨ **兑现了 {w.get('source','')}种草**，当初理由：\"{w.get('reason','')}\"")
        if visit_count_by_poi[v["poi_id"]] >= 2:
            bits.append(f"   - 🔁 本月去过 {visit_count_by_poi[v['poi_id']]} 次")
        lines.append("\n".join(bits))

    # 想去清单
    open_wishes = [w for w in data["wishes"] if w["status"] == "want"]
    if open_wishes:
        lines.append(f"\n# 想去但还没去（{len(open_wishes)} 家）")
        for w in open_wishes[:5]:
            s = stores.get(w["poi_id"], {})
            lines.append(f"- **{s.get('name', '?')}** ({w['source']}种草): \"{w['reason'] or '无理由'}\"")

    lines.append("\n---\n现在请基于以上清单写一段 80-130 字小记。再次提醒：**只能引用上面出现过的店名和细节**。")
    return "\n".join(lines)


@app.get("/api/monthly-story")
def get_monthly_story(year_month: Optional[str] = None, regenerate: bool = False, user: dict = Depends(current_user)):
    if not year_month:
        year_month = datetime.now().strftime("%Y-%m")

    circle_id = user["circle_id"]
    key = _story_key(circle_id, year_month)

    if not regenerate and key in _story_cache:
        return {"story": _story_cache[key], "cached": True, "year_month": year_month}

    brief = _build_story_brief(year_month, circle_id)
    if brief is None:
        return {"story": "", "empty": True, "year_month": year_month}

    try:
        story = ai.generate_monthly_story(brief)
    except Exception as e:
        raise HTTPException(500, f"AI 生成失败：{e}")

    _story_cache[key] = story
    return {"story": story, "cached": False, "year_month": year_month}


@app.post("/api/upload")
async def post_upload(file: UploadFile = File(...), _: dict = Depends(current_user)):
    """接收前端上传的图片（已在前端压缩），保存到 data/photos/ 并返回 URL。"""
    suffix = Path(file.filename or "img.jpg").suffix.lower() or ".jpg"
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".heic"}:
        raise HTTPException(400, f"不支持的格式: {suffix}")
    fname = f"{uuid.uuid4().hex[:12]}{suffix}"
    dest = PHOTOS_DIR / fname
    with dest.open("wb") as f:
        f.write(await file.read())
    return {"url": f"/photos/{fname}"}


@app.post("/api/wish")
def post_wish(req: WishReq, user: dict = Depends(current_user)):
    wish = db.Wish(
        store_hint=req.store_hint, poi_id=req.poi_id,
        source=req.source, reason=req.reason,
        recorded_by=user["username"],
        circle_id=user["circle_id"],
    )
    db.add_wish(wish)
    return {"wish_id": wish.wish_id}


# ---------- 启动入口 ----------

def _lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


# ---------- 生产模式：serve 前端 build（必须放最后，所有 /api 路由之后） ----------

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    ip = _lan_ip()
    port = int(os.environ.get("PORT", "8000"))
    print()
    print(f"  本机:   http://127.0.0.1:{port}")
    print(f"  局域网: http://{ip}:{port}   ← 手机连同 WiFi 用这个")
    print(f"  文档:   http://127.0.0.1:{port}/docs")
    print()
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
