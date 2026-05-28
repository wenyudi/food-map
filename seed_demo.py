"""清空数据库，造覆盖 4 种店铺状态的演示数据。

  🤍 种草中     - 渝味晓宇火锅（只种草，没去）
  ✨ 已兑现     - 格特士美式烤肉（3 个月前种草 → 今天去吃，自动兑现）
  🔁 二刷+      - 沙县小吃（直接去过两次）
  📍 直奔       - 贵州辣子鸡番茄鸡（一次没种草直接去）
"""
from datetime import datetime, timedelta

import amap
import db


def add_store(keywords: str, city: str = "重庆"):
    pois = amap.search_poi(keywords, region=city)
    if not pois:
        print(f"  ✗ 没搜到 {keywords}")
        return None
    store = amap.poi_to_store(pois[0])
    db.upsert_store(store)
    print(f"  ✓ {store.name}")
    return store


def add_visit(store, date, amount, people, emoji, want_again, feeling, wish_id=""):
    v = db.Visit(
        poi_id=store.poi_id,
        date=date, meal_period="晚",
        amount=amount, people_count=people,
        mood_emoji=emoji, want_again=want_again,
        feeling=feeling, companions="饼饼",
        amap_cost_ref=store.cost,
        value_label=db.compute_value_label(amount / people if people else 0, store.cost),
        wish_id=wish_id,
    )
    db.add_visit(v)
    return v


# 1. 清空
if db.DATA_FILE.exists():
    db.DATA_FILE.unlink()
    print("已清空旧数据库\n")


print("=== 1. 🤍 种草中（只种草） ===")
s1 = add_store("渝味晓宇火锅")
if s1:
    db.add_wish(db.Wish(
        store_hint=s1.name, poi_id=s1.poi_id,
        source="抖音", reason="网红老火锅，氛围据说很巴适",
    ))


print("\n=== 2. ✨ 已兑现（90 天前种草 → 今天去吃） ===")
s2 = add_store("格特士美式烤肉")
if s2:
    old = (datetime.now() - timedelta(days=90)).isoformat(timespec="seconds")
    w2 = db.Wish(
        store_hint=s2.name, poi_id=s2.poi_id,
        source="小红书", reason="看着烤肉很大块，氛围不错",
    )
    w2.created_at = old  # 手动设置为 90 天前
    db.add_wish(w2)

    open_wish = db.find_open_wish_by_poi(s2.poi_id)
    v2 = add_visit(s2, "2026-05-27", 200, 2, "😂", True,
                   "菜偏甜，但烤肉真的大块", open_wish["wish_id"] if open_wish else "")
    if open_wish:
        db.mark_wish_visited(open_wish["wish_id"], v2.visit_id)
        print(f"  → 兑现种草 ✨")


print("\n=== 3. 🔁 二刷+（去过两次） ===")
s3 = add_store("沙县小吃")
if s3:
    add_visit(s3, "2026-04-15", 16, 1, "😐", False, "凑合")
    add_visit(s3, "2026-05-20", 18, 1, "😂", True, "饿的时候还是真香")


print("\n=== 4. 📍 直奔（没种草直接去） ===")
s4 = add_store("贵州辣子鸡番茄鸡")
if s4:
    add_visit(s4, "2026-05-25", 80, 2, "🤤", True, "番茄鸡汤底意外地好喝")


print("\n=== 数据汇总 ===")
data = db.load_all()
print(f"  Stores: {len(data['stores'])}")
print(f"  Visits: {len(data['visits'])}")
print(f"  Wishes: {len(data['wishes'])}  ({sum(1 for w in data['wishes'] if w['status']=='want')} want / {sum(1 for w in data['wishes'] if w['status']=='visited')} visited)")
