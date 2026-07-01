"""SQLite 存储层 —— 接口对齐旧 storage.py，三张表：stores / visits / wishes。"""
from __future__ import annotations

import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional

# 通过 env 控制；本地默认放项目 data 目录，容器内一般是 /data/food_map.db
DATA_FILE = Path(os.environ.get("DATABASE_PATH") or (Path(__file__).parent / "data" / "food_map.db"))


# ---------- DataClass（接口与旧版完全一致） ----------

@dataclass
class Store:
    poi_id: str
    name: str
    typecode: str = ""
    type_name: str = ""
    tag: str = ""
    rating: str = ""
    cost: str = ""
    business_area: str = ""
    province: str = ""
    city: str = ""
    district: str = ""
    address: str = ""
    lng: float = 0.0
    lat: float = 0.0
    opentime: str = ""
    tel: str = ""
    amap_photos: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))


@dataclass
class Visit:
    poi_id: str
    date: str
    meal_period: str
    amount: float
    people_count: int
    mood_emoji: str
    want_again: bool
    feeling: str = ""
    companions: str = "饼饼"
    my_photos: str = ""
    amap_cost_ref: str = ""
    value_label: str = ""
    cuisine: str = ""       # AI 隐形维度：菜系（川菜/日料/面包…）
    flavors: str = ""       # 口味标签，逗号分隔（辣,麻,汤水）
    dishes: str = ""        # 招牌菜，逗号分隔（水煮鱼,毛血旺）
    occasion: str = ""      # 场合（约会/聚餐/工作餐/独自/家庭/庆祝/夜宵）
    wish_id: str = ""
    recorded_by: str = ""  # 谁录的（username）
    circle_id: int = 0     # 属于哪个圈子（数据隔离边界）
    visit_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    created_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    @property
    def per_person(self) -> float:
        return round(self.amount / self.people_count, 2) if self.people_count else 0.0


@dataclass
class Wish:
    store_hint: str
    poi_id: str  # 必填，杜绝模糊种草
    source: str = "手填"
    reason: str = ""
    cuisine: str = ""       # AI 隐形维度（与 Visit 同义）
    flavors: str = ""
    dishes: str = ""
    occasion: str = ""
    status: str = "want"
    visited_at: str = ""
    visit_id: str = ""
    recorded_by: str = ""
    circle_id: int = 0     # 属于哪个圈子（数据隔离边界）
    wish_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    created_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))


@dataclass
class User:
    username: str
    password_hash: str
    role: str = "user"  # 'admin' | 'user'
    id: int = 0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))


# ---------- 连接与建表 ----------

SCHEMA = """
CREATE TABLE IF NOT EXISTS circles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    owner_username TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS circle_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    circle_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'editor',   -- owner | editor | viewer
    joined_at TEXT NOT NULL,
    UNIQUE(circle_id, username)
);

CREATE TABLE IF NOT EXISTS stores (
    poi_id TEXT PRIMARY KEY,
    name TEXT, typecode TEXT, type_name TEXT, tag TEXT,
    rating TEXT, cost TEXT, business_area TEXT,
    province TEXT, city TEXT, district TEXT, address TEXT,
    lng REAL, lat REAL, opentime TEXT, tel TEXT, amap_photos TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS visits (
    visit_id TEXT PRIMARY KEY,
    poi_id TEXT NOT NULL,
    date TEXT, meal_period TEXT,
    amount REAL, people_count INTEGER, per_person REAL,
    amap_cost_ref TEXT, value_label TEXT,
    mood_emoji TEXT, want_again INTEGER,
    feeling TEXT, companions TEXT, my_photos TEXT,
    cuisine TEXT, flavors TEXT, dishes TEXT, occasion TEXT,
    wish_id TEXT, recorded_by TEXT, circle_id INTEGER, created_at TEXT,
    FOREIGN KEY (poi_id) REFERENCES stores(poi_id)
);

CREATE TABLE IF NOT EXISTS wishes (
    wish_id TEXT PRIMARY KEY,
    poi_id TEXT NOT NULL,
    store_hint TEXT, source TEXT, reason TEXT,
    cuisine TEXT, flavors TEXT, dishes TEXT, occasion TEXT,
    status TEXT DEFAULT 'want',
    created_at TEXT, visited_at TEXT, visit_id TEXT,
    recorded_by TEXT, circle_id INTEGER,
    FOREIGN KEY (poi_id) REFERENCES stores(poi_id)
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    email TEXT,
    nickname TEXT,
    circle_id INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT,
    circle_id INTEGER,              -- 邀请加入哪个圈子
    role TEXT DEFAULT 'editor',     -- 进来给什么角色：editor | viewer
    expires_at TEXT,                -- 过期时间；NULL = 不过期
    max_uses INTEGER,               -- 可用次数上限；NULL = 不限次
    use_count INTEGER DEFAULT 0,    -- 已用次数
    created_at TEXT NOT NULL,
    used_by TEXT,                   -- 最后使用者（兼容旧字段）
    used_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_cache (
    key TEXT PRIMARY KEY,
    value TEXT,
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS email_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,        -- register | reset
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_poi ON visits(poi_id);
CREATE INDEX IF NOT EXISTS idx_wishes_poi_status ON wishes(poi_id, status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_email_codes ON email_codes(email, purpose, created_at);
CREATE INDEX IF NOT EXISTS idx_circle_members_user ON circle_members(username);
CREATE INDEX IF NOT EXISTS idx_circle_members_circle ON circle_members(circle_id);
"""
# 注：circle_id 的索引放在 _migrate() 里建——老库 executescript 时该列还不存在，
# 直接写进 SCHEMA 会因「no such column: circle_id」报错。


def _migrate(c: sqlite3.Connection) -> None:
    """老库升级：补 recorded_by / circle_id 列，并把存量数据归入默认圈子。"""
    for table in ("visits", "wishes"):
        cols = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}
        if "recorded_by" not in cols:
            c.execute(f"ALTER TABLE {table} ADD COLUMN recorded_by TEXT")

    # AI 隐形维度：菜系 / 口味 / 招牌菜 / 场合
    for table in ("visits", "wishes"):
        cols = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}
        for col in ("cuisine", "flavors", "dishes", "occasion"):
            if col not in cols:
                c.execute(f"ALTER TABLE {table} ADD COLUMN {col} TEXT")

    # 圈子隔离：补 circle_id 列
    for table in ("users", "visits", "wishes", "invite_codes"):
        cols = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}
        if "circle_id" not in cols:
            c.execute(f"ALTER TABLE {table} ADD COLUMN circle_id INTEGER")

    # 存量数据（升级前的那对情侣）统一归入默认圈子 #1，避免变成孤儿数据
    need_default = c.execute(
        "SELECT COUNT(*) n FROM users WHERE circle_id IS NULL"
    ).fetchone()["n"]
    if need_default:
        now = datetime.now().isoformat(timespec="seconds")
        c.execute(
            "INSERT OR IGNORE INTO circles (id, name, created_at) VALUES (1, '默认圈子', ?)",
            (now,),
        )
        c.execute("UPDATE users  SET circle_id=1 WHERE circle_id IS NULL")
        c.execute("UPDATE visits SET circle_id=1 WHERE circle_id IS NULL")
        c.execute("UPDATE wishes SET circle_id=1 WHERE circle_id IS NULL")

    # circle_id 列此时一定存在了，再建索引（放 SCHEMA 里会先于列创建而报错）
    c.execute("CREATE INDEX IF NOT EXISTS idx_visits_circle ON visits(circle_id)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_wishes_circle ON wishes(circle_id)")

    # 邮箱验证码功能：users 补 email 列 + 部分唯一索引
    # （老库存量用户 email 为 NULL；SQLite 唯一索引允许多个 NULL，所以老号不冲突）
    ucols = {r["name"] for r in c.execute("PRAGMA table_info(users)")}
    if "email" not in ucols:
        c.execute("ALTER TABLE users ADD COLUMN email TEXT")
    if "nickname" not in ucols:
        c.execute("ALTER TABLE users ADD COLUMN nickname TEXT")
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL")
    c.execute("UPDATE users SET nickname=username WHERE nickname IS NULL OR nickname=''")  # 老号昵称默认=用户名

    # ===== 圈子多人化：circle_members 多对多 + 活跃圈子（users.circle_id 语义改为「当前活跃圈」）=====
    ccols = {r["name"] for r in c.execute("PRAGMA table_info(circles)")}
    if "owner_username" not in ccols:
        c.execute("ALTER TABLE circles ADD COLUMN owner_username TEXT")
    icols = {r["name"] for r in c.execute("PRAGMA table_info(invite_codes)")}
    for col, ddl in (("role", "TEXT DEFAULT 'editor'"), ("expires_at", "TEXT"),
                     ("max_uses", "INTEGER"), ("use_count", "INTEGER DEFAULT 0")):
        if col not in icols:
            c.execute(f"ALTER TABLE invite_codes ADD COLUMN {col} {ddl}")
    # 回填成员关系：现有每个 user → 其 circle_id 圈的成员（admin→owner，其余→editor）。
    # INSERT OR IGNORE + owner_username IS NULL 双重幂等，重复迁移不出错。
    now = datetime.now().isoformat(timespec="seconds")
    for u in c.execute("SELECT username, role, circle_id FROM users WHERE circle_id IS NOT NULL").fetchall():
        mrole = "owner" if u["role"] == "admin" else "editor"
        c.execute(
            "INSERT OR IGNORE INTO circle_members (circle_id, username, role, joined_at) VALUES (?, ?, ?, ?)",
            (u["circle_id"], u["username"], mrole, now),
        )
    for ci in c.execute("SELECT id FROM circles WHERE owner_username IS NULL").fetchall():
        owner = (c.execute("SELECT username FROM circle_members WHERE circle_id=? AND role='owner' LIMIT 1", (ci["id"],)).fetchone()
                 or c.execute("SELECT username FROM circle_members WHERE circle_id=? LIMIT 1", (ci["id"],)).fetchone())
        if owner:
            c.execute("UPDATE circles SET owner_username=? WHERE id=?", (owner["username"], ci["id"]))


_init_lock = threading.Lock()
_initialized = False


def _ensure_initialized(c: sqlite3.Connection) -> None:
    """建表 + 迁移 + 开 WAL —— 每进程只跑一次（旧实现每次查询都重跑，纯属浪费）。
    用双重检查锁守住：server 启动会显式 init_db()，CLI/脚本则首次连库时懒触发。"""
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        c.executescript(SCHEMA)
        _migrate(c)
        try:
            c.execute("PRAGMA journal_mode=WAL")  # 读写不互锁，手机端并发更稳
        except sqlite3.DatabaseError:
            pass  # 个别文件系统不支持 WAL，退回默认 journal 即可
        c.commit()
        _initialized = True


@contextmanager
def _conn():
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DATA_FILE)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA busy_timeout=5000")  # 并发写时等锁 5s，而不是立刻 SQLITE_BUSY 冒成 500（多人同时记一笔）
    _ensure_initialized(c)
    try:
        yield c
        c.commit()
    finally:
        c.close()


def init_db() -> None:
    """启动时调用一次（FastAPI lifespan）。也会被首次 _conn() 懒触发。"""
    with _conn():
        pass


def _row_to_dict(row) -> dict:
    return {k: row[k] for k in row.keys()}


# ---------- 业务操作 ----------

def upsert_store(s: Store) -> None:
    with _conn() as c:
        cols = list(asdict(s).keys())
        placeholders = ",".join(f":{k}" for k in cols)
        # created_at 不覆盖（保留首次入库时间）；其余按高德最新覆盖（同一 poi 信息基本一致）
        updates = ",".join(f"{k}=excluded.{k}" for k in cols if k not in ("poi_id", "created_at"))
        c.execute(
            f"INSERT INTO stores ({','.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT(poi_id) DO UPDATE SET {updates}",
            asdict(s),
        )


def store_in_circle(poi_id: str, circle_id: int) -> bool:
    """这家店是否出现在该圈子的记录/种草里——决定谁有权改它的名字（stores 表全局共享）。"""
    with _conn() as c:
        row = c.execute(
            "SELECT 1 FROM visits WHERE poi_id=? AND circle_id=? "
            "UNION SELECT 1 FROM wishes WHERE poi_id=? AND circle_id=? LIMIT 1",
            (poi_id, circle_id, poi_id, circle_id),
        ).fetchone()
        return row is not None


def rename_store(poi_id: str, name: str) -> bool:
    """改店名（修正录错的名字）。返回是否改到了一行。"""
    with _conn() as c:
        cur = c.execute("UPDATE stores SET name=? WHERE poi_id=?", (name, poi_id))
        return cur.rowcount > 0


def get_store(poi_id: str) -> Optional[dict]:
    """按 poi 取单行店铺（替代「load_all 全表扫一行」的浪费写法）。"""
    with _conn() as c:
        row = c.execute("SELECT * FROM stores WHERE poi_id=?", (poi_id,)).fetchone()
        return _row_to_dict(row) if row else None


def add_visit(v: Visit) -> None:
    data = asdict(v)
    data["per_person"] = v.per_person
    data["want_again"] = 1 if v.want_again else 0
    with _conn() as c:
        cols = list(data.keys())
        placeholders = ",".join(f":{k}" for k in cols)
        c.execute(f"INSERT INTO visits ({','.join(cols)}) VALUES ({placeholders})", data)


def add_wish(w: Wish) -> None:
    if not w.poi_id:
        raise ValueError("种草必须关联 POI id——过期就找不到是哪家了")
    with _conn() as c:
        cols = list(asdict(w).keys())
        placeholders = ",".join(f":{k}" for k in cols)
        c.execute(f"INSERT INTO wishes ({','.join(cols)}) VALUES ({placeholders})", asdict(w))


def find_open_wish_by_poi(poi_id: str, circle_id: Optional[int] = None) -> Optional[dict]:
    if not poi_id:
        return None
    with _conn() as c:
        if circle_id is None:
            row = c.execute(
                "SELECT * FROM wishes WHERE poi_id=? AND status='want' LIMIT 1",
                (poi_id,),
            ).fetchone()
        else:
            row = c.execute(
                "SELECT * FROM wishes WHERE poi_id=? AND status='want' AND circle_id=? LIMIT 1",
                (poi_id, circle_id),
            ).fetchone()
        return _row_to_dict(row) if row else None


def mark_wish_visited(wish_id: str, visit_id: str) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE wishes SET status='visited', visited_at=?, visit_id=? WHERE wish_id=?",
            (datetime.now().isoformat(timespec="seconds"), visit_id, wish_id),
        )


def revert_wish_to_want(wish_id: str) -> None:
    """删除某条访问时，把它当初兑现的种草退回「想去」。"""
    with _conn() as c:
        c.execute(
            "UPDATE wishes SET status='want', visited_at='', visit_id='' WHERE wish_id=?",
            (wish_id,),
        )


def reset_my_records(username: str, circle_id: Optional[int] = None) -> dict:
    """清空某用户在本圈子记的所有 visits + wishes（同伴的保留）。
    若他的访问曾兑现过种草（可能是同伴的），先把那些种草退回「想去」。"""
    with _conn() as c:
        rows = c.execute(
            "SELECT visit_id, my_photos FROM visits WHERE recorded_by=? AND circle_id=?",
            (username, circle_id),
        ).fetchall()
        my_visit_ids = [r["visit_id"] for r in rows]
        my_photos = [r["my_photos"] for r in rows if r["my_photos"]]  # 交给上层清文件
        if my_visit_ids:
            qs = ",".join("?" * len(my_visit_ids))
            c.execute(
                f"UPDATE wishes SET status='want', visited_at='', visit_id='' "
                f"WHERE visit_id IN ({qs}) AND circle_id=?",
                (*my_visit_ids, circle_id),
            )
        v = c.execute("DELETE FROM visits WHERE recorded_by=? AND circle_id=?",
                      (username, circle_id)).rowcount
        w = c.execute("DELETE FROM wishes WHERE recorded_by=? AND circle_id=?",
                      (username, circle_id)).rowcount
        return {"visits": v, "wishes": w, "photos": my_photos}


# ---------- 单条 visit / wish 的增改删（编辑/删除记录用） ----------

_VISIT_EDITABLE = {
    "date", "meal_period", "amount", "people_count", "per_person",
    "mood_emoji", "want_again", "feeling", "companions", "my_photos", "value_label",
}
_WISH_EDITABLE = {"source", "reason"}


def get_visit(visit_id: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM visits WHERE visit_id=?", (visit_id,)).fetchone()
        return _row_to_dict(row) if row else None


def update_visit(visit_id: str, fields: dict) -> None:
    fields = {k: v for k, v in fields.items() if k in _VISIT_EDITABLE}
    if not fields:
        return
    with _conn() as c:
        sets = ",".join(f"{k}=:{k}" for k in fields)
        c.execute(f"UPDATE visits SET {sets} WHERE visit_id=:_id", {**fields, "_id": visit_id})


def delete_visit(visit_id: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM visits WHERE visit_id=?", (visit_id,))


def get_wish(wish_id: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM wishes WHERE wish_id=?", (wish_id,)).fetchone()
        return _row_to_dict(row) if row else None


def update_wish(wish_id: str, fields: dict) -> None:
    fields = {k: v for k, v in fields.items() if k in _WISH_EDITABLE}
    if not fields:
        return
    with _conn() as c:
        sets = ",".join(f"{k}=:{k}" for k in fields)
        c.execute(f"UPDATE wishes SET {sets} WHERE wish_id=:_id", {**fields, "_id": wish_id})


def delete_wish(wish_id: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM wishes WHERE wish_id=?", (wish_id,))


def load_all(circle_id: Optional[int] = None) -> dict:
    """stores 是全局 POI 缓存（公开数据，可共享）；visits / wishes 按圈子隔离。
    circle_id 为 None 时不过滤（仅内部/迁移用，不要直接喂给接口）。
    传了 circle_id 时，stores 只取本圈子真正用到的 poi——不再把全局店表整张端给每个圈子。"""
    with _conn() as c:
        if circle_id is None:
            visits = [_row_to_dict(r) for r in c.execute("SELECT * FROM visits ORDER BY date")]
            wishes = [_row_to_dict(r) for r in c.execute("SELECT * FROM wishes")]
            stores = [_row_to_dict(r) for r in c.execute("SELECT * FROM stores")]
        else:
            visits = [_row_to_dict(r) for r in
                      c.execute("SELECT * FROM visits WHERE circle_id=? ORDER BY date", (circle_id,))]
            wishes = [_row_to_dict(r) for r in
                      c.execute("SELECT * FROM wishes WHERE circle_id=?", (circle_id,))]
            poi_ids = {v["poi_id"] for v in visits} | {w["poi_id"] for w in wishes}
            if poi_ids:
                qs = ",".join("?" * len(poi_ids))
                stores = [_row_to_dict(r) for r in
                          c.execute(f"SELECT * FROM stores WHERE poi_id IN ({qs})", tuple(poi_ids))]
            else:
                stores = []
        return {"stores": stores, "visits": visits, "wishes": wishes}


def count_visits_by_poi(poi_id: str, circle_id: Optional[int] = None) -> int:
    """某家店在本圈子被记录过几次（用于「二刷」里程碑判定）。"""
    with _conn() as c:
        return c.execute(
            "SELECT COUNT(*) c FROM visits WHERE poi_id=? AND circle_id=?",
            (poi_id, circle_id),
        ).fetchone()["c"]


def stats(circle_id: Optional[int] = None) -> dict:
    with _conn() as c:
        row = c.execute(
            "SELECT COUNT(*) c, COALESCE(SUM(amount),0) total FROM visits WHERE circle_id=?",
            (circle_id,),
        ).fetchone()
        return {
            "total_visits": row["c"],
            "total_amount": row["total"],
            "total_stores_visited": c.execute(
                "SELECT COUNT(DISTINCT poi_id) c FROM visits WHERE circle_id=?", (circle_id,)
            ).fetchone()["c"],
            "total_wishes_open": c.execute(
                "SELECT COUNT(*) c FROM wishes WHERE status='want' AND circle_id=?", (circle_id,)
            ).fetchone()["c"],
        }


# ---------- AI 结果缓存（落库，跨部署存活） ----------

def ai_cache_get(key: str) -> Optional[str]:
    with _conn() as c:
        row = c.execute("SELECT value FROM ai_cache WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None


def ai_cache_set(key: str, value: str) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO ai_cache (key, value, created_at) VALUES (?, ?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, created_at=excluded.created_at",
            (key, value, datetime.now().isoformat(timespec="seconds")),
        )


def ai_cache_delete(key: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM ai_cache WHERE key=?", (key,))


def ai_cache_delete_prefix(prefix: str) -> None:
    """按前缀批量失效（如 story:3: 清掉某圈子所有月份回忆）。前缀不含 % / _，可直接 LIKE。"""
    with _conn() as c:
        c.execute("DELETE FROM ai_cache WHERE key LIKE ?", (prefix + "%",))


# ---------- 圈子 / 成员 CRUD ----------

def create_circle(name: str = "", owner_username: Optional[str] = None) -> int:
    with _conn() as c:
        now = datetime.now().isoformat(timespec="seconds")
        cur = c.execute(
            "INSERT INTO circles (name, owner_username, created_at) VALUES (?, ?, ?)",
            (name, owner_username, now),
        )
        return int(cur.lastrowid or 0)


def get_circle(circle_id: int) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM circles WHERE id=?", (circle_id,)).fetchone()
        return _row_to_dict(row) if row else None


def rename_circle(circle_id: int, name: str) -> None:
    with _conn() as c:
        c.execute("UPDATE circles SET name=? WHERE id=?", (name, circle_id))


def set_circle_owner(circle_id: int, username: str) -> None:
    with _conn() as c:
        c.execute("UPDATE circles SET owner_username=? WHERE id=?", (username, circle_id))


def transfer_owner(circle_id: int, old_username: str, new_username: str) -> None:
    """转让圈主：circles.owner_username 换人 + 新主升 owner + 旧主降 editor，一次事务完成（不留半截）。"""
    with _conn() as c:
        c.execute("UPDATE circles SET owner_username=? WHERE id=?", (new_username, circle_id))
        c.execute("UPDATE circle_members SET role='owner' WHERE circle_id=? AND username=?", (circle_id, new_username))
        c.execute("UPDATE circle_members SET role='editor' WHERE circle_id=? AND username=?", (circle_id, old_username))


def delete_circle(circle_id: int) -> list[str]:
    """解散圈子：删圈子 + 成员关系 + 邀请码 + 该圈记录（visits/wishes）。stores 全局共享不删。
    返回被删 visits 的 my_photos，交上层清图片文件；整段一次事务提交，避免中途崩溃留半截。"""
    with _conn() as c:
        photos = [r["my_photos"] for r in c.execute(
            "SELECT my_photos FROM visits WHERE circle_id=? AND my_photos IS NOT NULL AND my_photos!=''",
            (circle_id,),
        ).fetchall()]
        c.execute("DELETE FROM visits WHERE circle_id=?", (circle_id,))
        c.execute("DELETE FROM wishes WHERE circle_id=?", (circle_id,))
        c.execute("DELETE FROM circle_members WHERE circle_id=?", (circle_id,))
        c.execute("DELETE FROM invite_codes WHERE circle_id=?", (circle_id,))
        c.execute("DELETE FROM circles WHERE id=?", (circle_id,))
        return photos


def add_member(circle_id: int, username: str, role: str = "editor") -> None:
    with _conn() as c:
        now = datetime.now().isoformat(timespec="seconds")
        c.execute(
            "INSERT OR IGNORE INTO circle_members (circle_id, username, role, joined_at) VALUES (?, ?, ?, ?)",
            (circle_id, username, role, now),
        )


def get_member(circle_id: int, username: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM circle_members WHERE circle_id=? AND username=?",
            (circle_id, username),
        ).fetchone()
        return _row_to_dict(row) if row else None


def member_role(circle_id: int, username: str) -> Optional[str]:
    m = get_member(circle_id, username)
    return m["role"] if m else None


def list_members(circle_id: int) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT m.username, m.role, m.joined_at, u.email, u.nickname "
            "FROM circle_members m LEFT JOIN users u ON u.username=m.username "
            "WHERE m.circle_id=? ORDER BY m.joined_at",
            (circle_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def list_my_circles(username: str) -> list[dict]:
    """我加入的圈子 + 我的角色 + 成员数（按加入时间）。"""
    with _conn() as c:
        rows = c.execute(
            "SELECT c.id, c.name, c.owner_username, m.role, "
            "  (SELECT COUNT(*) FROM circle_members WHERE circle_id=c.id) AS member_count "
            "FROM circle_members m JOIN circles c ON c.id=m.circle_id "
            "WHERE m.username=? ORDER BY m.joined_at",
            (username,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def update_member_role(circle_id: int, username: str, role: str) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE circle_members SET role=? WHERE circle_id=? AND username=?",
            (role, circle_id, username),
        )


def remove_member(circle_id: int, username: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM circle_members WHERE circle_id=? AND username=?", (circle_id, username))


def count_members(circle_id: int) -> int:
    with _conn() as c:
        return int(c.execute(
            "SELECT COUNT(*) n FROM circle_members WHERE circle_id=?", (circle_id,)
        ).fetchone()["n"])


def set_active_circle(username: str, circle_id: int) -> None:
    """切换当前活跃圈子（= users.circle_id，下游所有数据接口据此隔离）。"""
    with _conn() as c:
        c.execute("UPDATE users SET circle_id=? WHERE username=?", (circle_id, username))


# ---------- 用户 CRUD ----------

def create_user(username: str, password_hash: str, role: str = "user",
                circle_id: Optional[int] = None, email: Optional[str] = None,
                nickname: Optional[str] = None) -> int:
    with _conn() as c:
        now = datetime.now().isoformat(timespec="seconds")
        cur = c.execute(
            "INSERT INTO users (username, password_hash, role, email, nickname, circle_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (username, password_hash, role, email, nickname or username, circle_id, now),
        )
        return int(cur.lastrowid or 0)


def get_user(username: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return _row_to_dict(row) if row else None


def update_user_password(username: str, password_hash: str) -> None:
    with _conn() as c:
        c.execute("UPDATE users SET password_hash=? WHERE username=?", (password_hash, username))


def get_user_by_email(email: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        return _row_to_dict(row) if row else None


def set_user_email(username: str, email: str) -> None:
    with _conn() as c:
        c.execute("UPDATE users SET email=? WHERE username=?", (email, username))


# ---------- 邮箱验证码 CRUD ----------

def save_email_code(email: str, code: str, purpose: str, expires_at: str) -> int:
    with _conn() as c:
        now = datetime.now().isoformat(timespec="seconds")
        cur = c.execute(
            "INSERT INTO email_codes (email, code, purpose, expires_at, used, attempts, created_at) "
            "VALUES (?, ?, ?, ?, 0, 0, ?)",
            (email, code, purpose, expires_at, now),
        )
        return int(cur.lastrowid or 0)


def latest_email_code(email: str, purpose: str) -> Optional[dict]:
    """取该邮箱该用途最近一条（校验 + 限频都看它）。"""
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM email_codes WHERE email=? AND purpose=? ORDER BY id DESC LIMIT 1",
            (email, purpose),
        ).fetchone()
        return _row_to_dict(row) if row else None


def mark_email_code_used(code_id: int) -> None:
    with _conn() as c:
        c.execute("UPDATE email_codes SET used=1 WHERE id=?", (code_id,))


def bump_email_code_attempts(code_id: int) -> None:
    with _conn() as c:
        c.execute("UPDATE email_codes SET attempts=attempts+1 WHERE id=?", (code_id,))


def recent_code_count(since_iso: str) -> int:
    """某时间点之后全局发了多少验证码（全局限频用，防换邮箱轰炸刷额度）。"""
    with _conn() as c:
        return int(c.execute(
            "SELECT COUNT(*) n FROM email_codes WHERE created_at > ?", (since_iso,)
        ).fetchone()["n"])


def delete_email_code(code_id: int) -> None:
    """发信失败时回滚刚写入的码，别让它白占住冷却窗口。"""
    with _conn() as c:
        c.execute("DELETE FROM email_codes WHERE id=?", (code_id,))


def count_users() -> int:
    with _conn() as c:
        row = c.execute("SELECT COUNT(*) c FROM users").fetchone()
        return int(row["c"])


# ---------- 邀请码 CRUD ----------

def create_invite(code: str, circle_id: int, created_by: str, role: str = "viewer",
                  expires_at: Optional[str] = None, max_uses: Optional[int] = None) -> None:
    """可复用邀请码：绑定圈子 + 进来给的角色 + 过期时间 + 次数上限（NULL=不限）。"""
    with _conn() as c:
        c.execute(
            "INSERT INTO invite_codes (code, circle_id, created_by, role, expires_at, max_uses, use_count, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
            (code, circle_id, created_by, role, expires_at, max_uses,
             datetime.now().isoformat(timespec="seconds")),
        )


def consume_invite(code: str, used_by: str) -> bool:
    """原子消费一次邀请码：次数 +1，但仅当未超上限（防并发同时通过校验导致超用）。返回是否成功。"""
    with _conn() as c:
        cur = c.execute(
            "UPDATE invite_codes SET use_count=use_count+1, used_by=?, used_at=? "
            "WHERE code=? AND (max_uses IS NULL OR use_count < max_uses)",
            (used_by, datetime.now().isoformat(timespec="seconds"), code),
        )
        return cur.rowcount > 0


def get_invite(code: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM invite_codes WHERE code=?", (code,)).fetchone()
        return _row_to_dict(row) if row else None


def compute_value_label(actual_per_person: float, amap_cost: str) -> str:
    try:
        ref = float(amap_cost)
    except (TypeError, ValueError):
        return ""
    if ref <= 0 or actual_per_person <= 0:
        return ""
    diff = (actual_per_person - ref) / ref * 100
    if diff < -10:
        return f"💰 比官方便宜 {abs(diff):.0f}%"
    if diff > 10:
        return f"💸 比官方贵 {diff:.0f}%"
    return "≈ 与官方持平"
