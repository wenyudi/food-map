"""端到端测试：从一句话到地图。

模拟 `python cli.py say "..."` 的完整路径，但跳过用户互动确认。
"""
import ai, amap, storage, map_gen


def process_one(text: str, city: str = "重庆"):
    print(f"\n{'=' * 64}")
    print(f"📝 输入：{text}")

    p = ai.parse_one_liner(text)
    print(f"🤖 解析：intent={p['intent']}  店名={p['store_hint']}  日期={p.get('date')}")

    pois = amap.search_poi(p["store_hint"], region=city)
    if not pois:
        print("✗ 高德没搜到，跳过"); return
    store = amap.poi_to_store(pois[0])
    storage.upsert_store(store)
    print(f"📍 POI：{store.name}  ⭐{store.rating} ¥{store.cost}/人  [{store.tag}]")

    if p["intent"] == "visit":
        open_wish = storage.find_open_wish_by_poi(store.poi_id)
        if open_wish:
            print(f"💡 命中种草：{open_wish['source']} · {open_wish['reason']}")

        amount = p.get("amount") or 0
        people = p.get("people_count") or 2
        visit = storage.Visit(
            poi_id=store.poi_id,
            date=p.get("date") or "",
            meal_period=p.get("meal_period") or "晚",
            amount=amount, people_count=people,
            mood_emoji=p.get("mood_emoji") or "😂",
            want_again=p.get("want_again") if p.get("want_again") is not None else True,
            feeling=p.get("feeling") or "",
            companions=p.get("companions") or "饼饼",
            amap_cost_ref=store.cost,
            value_label=storage.compute_value_label(amount / people if people else 0, store.cost),
            wish_id=open_wish["wish_id"] if open_wish else "",
        )
        storage.add_visit(visit)
        if open_wish:
            storage.mark_wish_visited(open_wish["wish_id"], visit.visit_id)
        print(f"✓ Visit: ¥{visit.per_person}/人 {visit.value_label}  {visit.mood_emoji}")

    elif p["intent"] == "wish":
        wish = storage.Wish(
            store_hint=store.name,
            source=p.get("source") or "小红书",
            reason=p.get("reason") or "",
            poi_id=store.poi_id,
        )
        storage.add_wish(wish)
        print(f"✓ Wish: {wish.source} · {wish.reason}")


# 清空旧数据
from pathlib import Path
for f in [storage.DATA_FILE, map_gen.OUT_FILE]:
    if f.exists(): f.unlink()


# 跑几个场景
process_one("先在小红书种草鼎泰丰，听说小笼包绝了")
process_one("昨晚和饼饼去鼎泰丰吃了300，小笼包确实绝了，下次还来")  # 兑现种草
process_one("今天中午一个人去吃了沙县小吃16块，凑合")
process_one("抖音上看到渝味晓宇火锅想去")


print("\n" + "=" * 64)
out = map_gen.generate()
print(f"\n✓ 地图已生成：{out}")
print(f"  浏览器打开 → 应该看到 4 个点位（1 已去种草 + 1 单独已去 + 1 单独想去 + 1 兑现）")
