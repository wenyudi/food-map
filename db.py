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
    wish_id: str = ""
    recorded_by: str = ""  # 谁录的（username）
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
    status: str = "want"
    visited_at: str = ""
    visit_id: str = ""
    recorded_by: str = ""
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
    wish_id TEXT, recorded_by TEXT, created_at TEXT,
    FOREIGN KEY (poi_id) REFERENCES stores(poi_id)
);

CREATE TABLE IF NOT EXISTS wishes (
    wish_id TEXT PRIMARY KEY,
    poi_id TEXT NOT NULL,
    store_hint TEXT, source TEXT, reason TEXT,
    status TEXT DEFAULT 'want',
    created_at TEXT, visited_at TEXT, visit_id TEXT,
    recorded_by TEXT,
    FOREIGN KEY (poi_id) REFERENCES stores(poi_id)
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_visits_poi ON visits(poi_id);
CREATE INDEX IF NOT EXISTS idx_wishes_poi_status ON wishes(poi_id, status);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
"""


def _migrate(c: sqlite3.Connection) -> None:
    """老库升级：补 recorded_by 列。"""
    for table in ("visits", "wishes"):
        cols = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}
        if "recorded_by" not in cols:
            c.execute(f"ALTER TABLE {table} ADD COLUMN recorded_by TEXT")


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


def find_open_wish_by_poi(poi_id: str) -> Optional[dict]:
    if not poi_id:
        return None
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM wishes WHERE poi_id=? AND status='want' LIMIT 1",
            (poi_id,),
        ).fetchone()
        return _row_to_dict(row) if row else None


def mark_wish_visited(wish_id: str, visit_id: str) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE wishes SET status='visited', visited_at=?, visit_id=? WHERE wish_id=?",
            (datetime.now().isoformat(timespec="seconds"), visit_id, wish_id),
        )


def load_all() -> dict:
    with _conn() as c:
        return {
            "stores": [_row_to_dict(r) for r in c.execute("SELECT * FROM stores")],
            "visits": [_row_to_dict(r) for r in c.execute("SELECT * FROM visits ORDER BY date")],
            "wishes": [_row_to_dict(r) for r in c.execute("SELECT * FROM wishes")],
        }


def list_recent_visits(limit: int = 10) -> list[dict]:
    """带 store 信息的最近访问（供前端列表页用）。"""
    with _conn() as c:
        rows = c.execute(
            """
            SELECT v.*, s.name AS store_name, s.tag AS store_tag, s.business_area
            FROM visits v JOIN stores s ON v.poi_id = s.poi_id
            ORDER BY v.date DESC, v.created_at DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def list_open_wishes() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            """
            SELECT w.*, s.name AS store_name, s.tag AS store_tag, s.business_area, s.lng, s.lat
            FROM wishes w JOIN stores s ON w.poi_id = s.poi_id
            WHERE w.status='want' ORDER BY w.created_at DESC
            """,
        ).fetchall()
        return [_row_to_dict(r) for r in rows]


def stats() -> dict:
    with _conn() as c:
        row = c.execute("SELECT COUNT(*) c, COALESCE(SUM(amount),0) total FROM visits").fetchone()
        return {
            "total_visits": row["c"],
            "total_amount": row["total"],
            "total_stores_visited": c.execute("SELECT COUNT(DISTINCT poi_id) c FROM visits").fetchone()["c"],
            "total_wishes_open": c.execute("SELECT COUNT(*) c FROM wishes WHERE status='want'").fetchone()["c"],
        }


# ---------- 用户 CRUD ----------

def create_user(username: str, password_hash: str, role: str = "user") -> int:
    with _conn() as c:
        now = datetime.now().isoformat(timespec="seconds")
        cur = c.execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
            (username, password_hash, role, now),
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
