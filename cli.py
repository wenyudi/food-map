"""饼饼の美食地图 · 命令行入口

  python cli.py say "..."   一句话录入（AI 自动判断 吃过/种草）⭐ 推荐
  python cli.py add         记一笔吃过（互动版）
  python cli.py wish        种草一家（互动版）
  python cli.py map         生成地图 HTML
  python cli.py ls          列出最近访问
"""
from __future__ import annotations

import sys
from datetime import datetime

import ai
import amap
import storage

EMOJI_OPTIONS = [
    ("1", "😋", "太好吃"),
    ("2", "🤤", "好吃"),
    ("3", "😂", "一般"),
    ("4", "😐", "不咋地"),
]
DEFAULT_CITY = "重庆"


def _ask(prompt: str, default: str = "") -> str:
    tip = f" [{default}]" if default else ""
    val = input(f"{prompt}{tip}: ").strip()
    return val or default


def _meal_period_from_now() -> str:
    h = datetime.now().hour
    if h < 10:
        return "早"
    if h < 16:
        return "中"
    return "晚"


def _pick_poi(keywords: str, region: str) -> dict | None:
    print(f"  → 高德搜「{keywords}」@ {region} …")
    pois = amap.search_poi(keywords, region=region, limit=3)
    if not pois:
        print("  ✗ 没找到，换个关键词或者跳过 POI 直接存模糊店名？")
        return None
    if len(pois) == 1:
        print(f"  ✓ {amap.format_poi_brief(pois[0])}")
        return pois[0]
    print("  请选一个（也可输 0 跳过）：")
    for i, p in enumerate(pois, 1):
        print(f"   {i}. {amap.format_poi_brief(p)}")
    while True:
        choice = input("  选: ").strip()
        if choice == "0":
            return None
        if choice.isdigit() and 1 <= int(choice) <= len(pois):
            return pois[int(choice) - 1]


def _pick_emoji() -> str:
    print("  评分：", "  ".join(f"{n}.{e} {label}" for n, e, label in EMOJI_OPTIONS))
    while True:
        c = input("  选 (1-4): ").strip()
        for n, e, _ in EMOJI_OPTIONS:
            if c == n:
                return e


def cmd_add():
    print("\n=== 记一笔吃过 ===")
    kw = _ask("店名关键词")
    if not kw:
        print("没说店名，跳出"); return
    city = _ask("城市", DEFAULT_CITY)

    poi = _pick_poi(kw, city)
    if not poi:
        print("没选 POI，先不记了"); return

    store = amap.poi_to_store(poi)
    storage.upsert_store(store)

    open_wish = storage.find_open_wish_by_poi(store.poi_id)
    if open_wish:
        print(f"\n  💡 你 {open_wish['created_at'][:10]} 种草过这家")
        print(f"     来源：{open_wish['source']}　理由：{open_wish['reason']}")
        print("     —— 这次吃完会自动标记为已兑现 ✨\n")

    amount = float(_ask("一共花了多少 ¥"))
    people = int(_ask("几个人", "2"))
    emoji = _pick_emoji()
    again = _ask("想再来吗 (y/n)", "y").lower().startswith("y")
    feeling = _ask("一句话感受（可空）")
    companions = _ask("和谁", "饼饼")

    visit = storage.Visit(
        poi_id=store.poi_id,
        date=datetime.now().strftime("%Y-%m-%d"),
        meal_period=_meal_period_from_now(),
        amount=amount, people_count=people,
        mood_emoji=emoji, want_again=again,
        feeling=feeling, companions=companions,
        amap_cost_ref=store.cost,
        value_label=storage.compute_value_label(amount / people if people else 0, store.cost),
        wish_id=open_wish["wish_id"] if open_wish else "",
    )
    storage.add_visit(visit)
    if open_wish:
        storage.mark_wish_visited(open_wish["wish_id"], visit.visit_id)

    print(f"\n  ✓ 已记录：{store.name}")
    print(f"    人均 ¥{visit.per_person}  {visit.value_label}")
    print(f"    {emoji}  {'⭐ 想再来' if again else ''}")


def cmd_wish():
    print("\n=== 种草一家 ===")
    hint = _ask("店名关键词（要尽量准确，会立刻搜高德）")
    if not hint:
        print("没说店名，跳出"); return
    city = _ask("城市", DEFAULT_CITY)

    poi = _pick_poi(hint, city)
    if not poi:
        print("  没匹配到，先不种草——等想清楚是哪家再来"); return

    store = amap.poi_to_store(poi)
    storage.upsert_store(store)

    source = _ask("从哪看到的（小红书/抖音/朋友/路过）", "小红书")
    reason = _ask("一句话理由（可空）")

    wish = storage.Wish(store_hint=store.name, source=source, reason=reason, poi_id=store.poi_id)
    storage.add_wish(wish)
    print(f"\n  ✓ 已收藏：{store.name}\n")


def cmd_map():
    import map_gen
    out = map_gen.generate()
    print(f"\n  ✓ 地图已生成：{out}\n")


def cmd_ls():
    data = storage.load_all()
    visits = data["visits"][-10:]
    print(f"\n  最近 {len(visits)} 次：")
    stores_by_id = {s["poi_id"]: s for s in data["stores"]}
    for v in visits:
        s = stores_by_id.get(v["poi_id"], {})
        print(f"   {v['date']} {v['meal_period']}  {s.get('name','?')}  "
              f"¥{v['per_person']}/人  {v['mood_emoji']}  {v['value_label']}")
    print()


def cmd_say():
    text = " ".join(sys.argv[2:]).strip()
    if not text:
        print('使用：python cli.py say "你的话"'); return

    print(f"\n🤖 解析中：{text}")
    try:
        p = ai.parse_one_liner(text)
    except Exception as e:
        print(f"  ✗ AI 解析失败：{e}"); return

    intent = p.get("intent")
    print(f"  AI 识别 → 意图:{intent}　店名:{p.get('store_hint')}　日期:{p.get('date') or '-'}")

    if intent == "visit":
        _say_visit(p)
    elif intent == "wish":
        _say_wish(p)
    else:
        print("  ✗ 没识别出意图，请用 add 或 wish 命令")


def _say_visit(p: dict):
    city = _ask("城市", DEFAULT_CITY)
    poi = _pick_poi(p.get("store_hint", ""), city)
    if not poi:
        print("  没选 POI，跳出"); return

    store = amap.poi_to_store(poi)
    storage.upsert_store(store)

    open_wish = storage.find_open_wish_by_poi(store.poi_id)
    if open_wish:
        print(f"\n  💡 {open_wish['created_at'][:10]} 种草过：{open_wish['source']} · {open_wish['reason']}\n")

    amount = float(_ask("金额 ¥", str(p.get("amount") or "")))
    people = int(_ask("人数", str(p.get("people_count") or 2)))

    emoji_d = p.get("mood_emoji")
    if emoji_d:
        labels = "  ".join(f"{n}.{e}{lbl}" for n, e, lbl in EMOJI_OPTIONS)
        c = input(f"  评分 (AI:{emoji_d}, 回车接受，或 {labels}): ").strip()
        emoji = next((e for n, e, _ in EMOJI_OPTIONS if c == n), emoji_d) if c else emoji_d
    else:
        emoji = _pick_emoji()

    wa_d = p.get("want_again")
    if wa_d is None:
        want_again = _ask("想再来 (y/n)", "y").lower().startswith("y")
    else:
        want_again = _ask(f"想再来 (AI 推断:{'y' if wa_d else 'n'})", "y" if wa_d else "n").lower().startswith("y")

    feeling = _ask("感受", p.get("feeling") or "")
    companions = _ask("和谁", p.get("companions") or "饼饼")
    date = p.get("date") or datetime.now().strftime("%Y-%m-%d")
    meal_period = p.get("meal_period") or _meal_period_from_now()

    visit = storage.Visit(
        poi_id=store.poi_id,
        date=date, meal_period=meal_period,
        amount=amount, people_count=people,
        mood_emoji=emoji, want_again=want_again,
        feeling=feeling, companions=companions,
        amap_cost_ref=store.cost,
        value_label=storage.compute_value_label(amount / people if people else 0, store.cost),
        wish_id=open_wish["wish_id"] if open_wish else "",
    )
    storage.add_visit(visit)
    if open_wish:
        storage.mark_wish_visited(open_wish["wish_id"], visit.visit_id)

    print(f"\n  ✓ 记录：{store.name}")
    print(f"    {date} {meal_period} · ¥{visit.per_person}/人 {visit.value_label}")
    print(f"    {emoji} {'⭐ 想再来' if want_again else ''}")


def _say_wish(p: dict):
    city = _ask("城市", DEFAULT_CITY)
    poi = _pick_poi(p.get("store_hint", ""), city)
    if not poi:
        print("  没匹配到，先不种草"); return

    store = amap.poi_to_store(poi)
    storage.upsert_store(store)

    source = _ask("来源", p.get("source") or "小红书")
    reason = _ask("理由", p.get("reason") or "")

    wish = storage.Wish(store_hint=store.name, source=source, reason=reason, poi_id=store.poi_id)
    storage.add_wish(wish)
    print(f"\n  ✓ 收藏：{store.name}\n")


COMMANDS = {"say": cmd_say, "add": cmd_add, "wish": cmd_wish, "map": cmd_map, "ls": cmd_ls}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        return
    COMMANDS[sys.argv[1]]()


if __name__ == "__main__":
    main()
