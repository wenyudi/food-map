"""跑一遍完整闭环：种草 → 兑现吃饭 → 生成地图。

模拟饼饼日记里那一条真实数据 + 一条模糊种草。
"""
import storage, amap, map_gen


print("==== 1. 种草『格特士美式烤肉』（已关联 POI） ====")
pois = amap.search_poi("格特士美式烤肉", region="重庆")
print(f"  高德返回 {len(pois)} 条候选")
store = amap.poi_to_store(pois[0])
storage.upsert_store(store)
print(f"  店铺入库：{store.name}")
print(f"           {store.tag} · ⭐{store.rating} · ¥{store.cost}/人 · {store.business_area}")

wish = storage.Wish(
    store_hint="格特士美式烤肉",
    source="小红书",
    reason="看着烤肉很大块，氛围不错",
    poi_id=store.poi_id,
)
storage.add_wish(wish)
print(f"  种草入库：wish_id={wish.wish_id}")


print("\n==== 2. 兑现：吃了一顿格特士 ====")
open_wish = storage.find_open_wish_by_poi(store.poi_id)
if open_wish:
    print(f"  💡 命中种草：{open_wish['source']} · {open_wish['reason']}")

visit = storage.Visit(
    poi_id=store.poi_id,
    date="2025-07-22",
    meal_period="晚",
    amount=200,
    people_count=2,
    mood_emoji="😂",
    want_again=True,
    feeling="菜偏甜，汉堡吃得有点腻",
    companions="饼饼",
    amap_cost_ref=store.cost,
    value_label=storage.compute_value_label(100, store.cost),
    wish_id=open_wish["wish_id"] if open_wish else "",
)
storage.add_visit(visit)
if open_wish:
    storage.mark_wish_visited(open_wish["wish_id"], visit.visit_id)
print(f"  访问入库：visit_id={visit.visit_id}")
print(f"           人均 ¥{visit.per_person}  {visit.value_label}")
print(f"           {visit.mood_emoji} {'⭐ 想再来' if visit.want_again else ''}")


print("\n==== 3. 再种一家想去的（纯想去）====")
pois2 = amap.search_poi("渝味晓宇火锅", region="重庆")
if pois2:
    store2 = amap.poi_to_store(pois2[0])
    storage.upsert_store(store2)
    wish2 = storage.Wish(
        store_hint=store2.name,
        source="抖音",
        reason="网红老火锅",
        poi_id=store2.poi_id,
    )
    storage.add_wish(wish2)
    print(f"  种草第二家：{store2.name}")


print("\n==== 4. 生成地图 HTML ====")
out = map_gen.generate()
print(f"  ✓ 已生成：{out}")
print(f"  浏览器打开看效果")
