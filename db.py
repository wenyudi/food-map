"""SQLite 存储层 —— 接口对齐旧 storage.py，三张表：stores / visits / wishes。"""
from __future__ import annotations

import os
import sqlite3
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
    created_at TEXT NOT NULL
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
    circle_id INTEGER,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invite_codes (
    code TEXT PRIMARY KEY,
    created_by TEXT,
    circle_id INTEGER,          -- NULL = 注册时新建独立圈子；否则加入该圈子
    created_at TEXT NOT NULL,
    used_by TEXT,
    used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_visits_poi ON visits(poi_id);
CREATE INDEX IF NOT EXISTS idx_wishes_poi_status ON wishes(poi_id, status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
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


@contextmanager
def _conn():
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DATA_FILE)
    c.row_factory = sqlite3.Row
    c.executescript(SCHEMA)
    _migrate(c)
    try:
        yield c
        c.commit()
    finally:
        c.close()


def _row_to_dict(row) -> dict:
    return {k: row[k] for k in row.keys()}


# ---------- 业务操作 ----------

def upsert_store(s: Store) -> None:
    with _conn() as c:
        cols = list(asdict(s).keys())
        placeholders = ",".join(f":{k}" for k in cols)
        updates = ",".join(f"{k}=excluded.{k}" for k in cols if k != "poi_id")
        c.execute(
            f"INSERT INTO stores ({','.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT(poi_id) DO UPDATE SET {updates}",
            asdict(s),
        )


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
        my_visit_ids = [r["visit_id"] for r in c.execute(
            "SELECT visit_id FROM visits WHERE recorded_by=? AND circle_id=?",
            (username, circle_id),
        ).fetchall()]
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
        return {"visits": v, "wishes": w}


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
    circle_id 为 None 时不过滤（仅内部/迁移用，不要直接喂给接口）。"""
    with _conn() as c:
        stores = [_row_to_dict(r) for r in c.execute("SELECT * FROM stores")]
        if circle_id is None:
            vrows = c.execute("SELECT * FROM visits ORDER BY date")
            wrows = c.execute("SELECT * FROM wishes")
        else:
            vrows = c.execute("SELECT * FROM visits WHERE circle_id=? ORDER BY date", (circle_id,))
            wrows = c.execute("SELECT * FROM wishes WHERE circle_id=?", (circle_id,))
        return {
            "stores": stores,
            "visits": [_row_to_dict(r) for r in vrows],
            "wishes": [_row_to_dict(r) for r in wrows],
        }


def list_recent_visits(limit: int = 10, circle_id: Optional[int] = None) -> list[dict]:
    """带 store 信息的最近访问（供前端列表页用）。"""
    with _conn() as c:
        rows = c.execute(
            """
            SELECT v.*, s.name AS store_name, s.tag AS store_tag, s.business_area
            FROM visits v JOIN stores s ON v.poi_id = s.poi_id
            WHERE v.circle_id=?
            ORDER BY v.date DESC, v.created_at DESC LIMIT ?
            """,
            (circle_id, limit),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def list_open_wishes(circle_id: Optional[int] = None) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            """
            SELECT w.*, s.name AS store_name, s.tag AS store_tag, s.business_area, s.lng, s.lat
            FROM wishes w JOIN stores s ON w.poi_id = s.poi_id
            WHERE w.status='want' AND w.circle_id=? ORDER BY w.created_at DESC
            """,
            (circle_id,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


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


# ---------- 圈子 CRUD ----------

def create_circle(name: str = "") -> int:
    with _conn() as c:
        now = datetime.now().isoformat(timespec="seconds")
        cur = c.execute(
            "INSERT INTO circles (name, created_at) VALUES (?, ?)",
            (name, now),
        )
        return int(cur.lastrowid or 0)


# ---------- 用户 CRUD ----------

def create_user(username: str, password_hash: str, role: str = "user",
                circle_id: Optional[int] = None) -> int:
    with _conn() as c:
        now = datetime.now().isoformat(timespec="seconds")
        cur = c.execute(
            "INSERT INTO users (username, password_hash, role, circle_id, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (username, password_hash, role, circle_id, now),
        )
        return int(cur.lastrowid or 0)


def get_user(username: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return _row_to_dict(row) if row else None


def list_users() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT id, username, role, created_at FROM users ORDER BY id").fetchall()
        return [_row_to_dict(r) for r in rows]


def delete_user(username: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM users WHERE username=?", (username,))


def update_user_password(username: str, password_hash: str) -> None:
    with _conn() as c:
        c.execute("UPDATE users SET password_hash=? WHERE username=?", (password_hash, username))


def count_users() -> int:
    with _conn() as c:
        row = c.execute("SELECT COUNT(*) c FROM users").fetchone()
        return int(row["c"])


# ---------- 邀请码 CRUD ----------

def create_invite(code: str, created_by: str, circle_id: Optional[int] = None) -> None:
    """circle_id 为 None 表示「注册时新建独立圈子」；否则注册者加入该圈子。"""
    with _conn() as c:
        c.execute(
            "INSERT INTO invite_codes (code, created_by, circle_id, created_at) VALUES (?, ?, ?, ?)",
            (code, created_by, circle_id, datetime.now().isoformat(timespec="seconds")),
        )


def get_invite(code: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM invite_codes WHERE code=?", (code,)).fetchone()
        return _row_to_dict(row) if row else None


def list_invites() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM invite_codes ORDER BY created_at DESC").fetchall()
        return [_row_to_dict(r) for r in rows]


def mark_invite_used(code: str, username: str) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE invite_codes SET used_by=?, used_at=? WHERE code=?",
            (username, datetime.now().isoformat(timespec="seconds"), code),
        )


def delete_invite(code: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM invite_codes WHERE code=?", (code,))


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
