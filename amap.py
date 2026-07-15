"""高德 POI 2.0 查询封装

只暴露两个函数：
  search_poi(keywords, region/location)  → 候选列表（top 3 让用户挑）
  poi_to_store(poi)                      → 归一化为 Store dataclass
"""
from __future__ import annotations

import os
import re
from typing import Optional

import requests

from db import Store

AMAP_KEY = os.environ.get("AMAP_KEY", "")

SEARCH_URL = "https://restapi.amap.com/v5/place/text"
AROUND_URL = "https://restapi.amap.com/v5/place/around"
DETAIL_URL = "https://restapi.amap.com/v5/place/detail"
REGEO_URL = "https://restapi.amap.com/v3/geocode/regeo"
INPUTTIPS_URL = "https://restapi.amap.com/v3/assistant/inputtips"
SHOW_FIELDS = "business,photos,children,navi"


def _get(url: str, params: dict) -> dict:
    """统一请求：网络错 / 非 2xx / 非 JSON 全收敛成 RuntimeError（上层 except RuntimeError 已接住），
    再校验高德业务 status——避免网关 502、超时直接冒成未捕获的 500。"""
    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        raise RuntimeError(f"高德连接失败：{e}") from e
    except ValueError as e:
        raise RuntimeError("高德返回了无法解析的内容") from e
    if data.get("status") != "1":
        raise RuntimeError(f"高德 API 报错：{data.get('info')} (code={data.get('infocode')})")
    return data


def _call(url: str, params: dict) -> list[dict]:
    return _get(url, params).get("pois", []) or []


def _norm_name(s: str) -> str:
    """店名归一化（去空格/分隔符/大小写），用于去重和匹配。"""
    return re.sub(r"[\s·・.\-—()（）]", "", (s or "")).lower()


def _tip_to_poi(tip: dict) -> dict:
    """把 inputtips 候选转成与 place/text 一致的 poi 形状（缺的 business 字段留空）。"""
    district = (tip.get("district") or "").strip()
    short = (district.split("市")[-1] or district) if "市" in district else district
    return {
        "id": tip.get("id", ""),
        "name": tip.get("name", ""),
        "location": tip.get("location", ""),
        "typecode": tip.get("typecode", ""),
        "type": "",
        "pname": "", "cityname": "", "adname": short,
        "address": tip.get("address", ""),
        "business": {"business_area": short} if short else {},
        "photos": [],
    }


def input_tips(keywords: str, city: Optional[str] = None, location: Optional[str] = None) -> list[dict]:
    """高德「输入提示」≈ App 搜索框：对店名匹配远好于 place/text，能搜到很多 place/text 漏掉的店。
    只取带坐标的 POI，转成 poi 形状返回。"""
    params = {"key": AMAP_KEY, "keywords": keywords, "datatype": "poi"}
    if city:
        params["city"] = city
    if location:
        params["location"] = location  # 周边优先排序
    data = _get(INPUTTIPS_URL, params)
    out = []
    for t in (data.get("tips") or []):
        if isinstance(t, dict) and isinstance(t.get("location"), str) and t.get("location").strip():
            out.append(_tip_to_poi(t))
    return out


def _merge_pois(keywords: str, text_pois: list[dict], tip_pois: list[dict]) -> list[dict]:
    """合并 place/text 与 inputtips：inputtips 里 place/text 没返回的补进来；与关键词强匹配的
    （多半是用户真正想找的那家）排最前，避免被 place/text 的模糊错配挡住。"""
    kw = _norm_name(keywords)
    text_names = {_norm_name(p.get("name")) for p in text_pois}
    extra = [p for p in tip_pois if _norm_name(p.get("name")) not in text_names]
    strong = [p for p in extra if kw and (kw in _norm_name(p.get("name")) or _norm_name(p.get("name")) in kw)]
    weak = [p for p in extra if p not in strong]
    return strong + text_pois + weak


def search_poi(keywords: str, region: Optional[str] = None, location: Optional[str] = None,
               limit: int = 5, around_radius: int = 5000) -> list[dict]:
    """搜店铺：place/text（周边优先→全市/全国）+ inputtips 兜底合并。

    place/text 关键字搜索覆盖有限（很多店搜不到，还可能模糊错配）；inputtips 与高德 App 一致、
    匹配强但无 business 字段。place/text 没强匹配时才查 inputtips，强匹配结果排最前。
    """
    common = {"key": AMAP_KEY, "keywords": keywords, "show_fields": SHOW_FIELDS, "page_size": limit}

    # 1. place/text：有定位先周边搜，否则全市 / 全国
    text_pois: list[dict] = []
    if location:
        text_pois = _call(AROUND_URL, {**common, "location": location, "radius": around_radius})
    if not text_pois:
        text_pois = (_call(SEARCH_URL, {**common, "region": region, "city_limit": "true"})
                     if region else _call(SEARCH_URL, common))

    # 2. place/text 没有强匹配（空 or 模糊错配）→ inputtips 兜底（失败不影响主流程）
    kw = _norm_name(keywords)
    has_strong = any(kw and (kw in _norm_name(p.get("name")) or _norm_name(p.get("name")) in kw) for p in text_pois)
    tip_pois: list[dict] = []
    if not has_strong:
        try:
            tip_pois = input_tips(keywords, city=region, location=location)
        except RuntimeError:
            tip_pois = []

    return _merge_pois(keywords, text_pois, tip_pois)[:limit]


def search_by_name(keywords: str, region: Optional[str] = None, location: Optional[str] = None,
                   limit: int = 10) -> list[dict]:
    """店名直搜：inputtips 主路 + place/text 全市辅路，无周边短路。

    与 search_poi 的区别：用户输入的就是店名，要的是「这家店」而不是「附近这类店」——
    所以不做周边优先，补记（人不在店附近）也能搜到。inputtips 是高德 App 搜索框同款接口，
    对店名的召回最强；place/text 全市搜作辅路，主要为同 id 候选补齐 business 字段。
    """
    errs: list[RuntimeError] = []

    tip_pois: list[dict] = []
    try:
        tip_pois = input_tips(keywords, city=region, location=location)
    except RuntimeError as e:
        errs.append(e)

    text_pois: list[dict] = []
    try:
        params = {"key": AMAP_KEY, "keywords": keywords, "show_fields": SHOW_FIELDS, "page_size": limit}
        if region:
            params.update(region=region, city_limit="true")
        text_pois = _call(SEARCH_URL, params)
    except RuntimeError as e:
        errs.append(e)

    if len(errs) == 2:  # 两路全挂才算失败；单路失败静默降级
        raise errs[0]

    # 按 poi id 去重合并：inputtips 定顺序（名称相关性最强），同 id 优先取 place/text 版本（带 business）
    text_by_id = {p.get("id"): p for p in text_pois if p.get("id")}
    merged: list[dict] = []
    seen: set[str] = set()
    for p in tip_pois + text_pois:
        pid = p.get("id", "")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        merged.append(text_by_id.get(pid, p))

    # 名称匹配强度分档排序（稳定排序，同档保持来源相关性顺序）：全等 > 子串互含 > 其他
    kw = _norm_name(keywords)

    def rank(p: dict) -> int:
        name = _norm_name(p.get("name"))
        if not kw:
            return 2
        if name == kw:
            return 0
        if kw in name or name in kw:
            return 1
        return 2

    merged.sort(key=rank)
    return merged[:limit]


def poi_detail(poi_id: str) -> dict:
    """按 poi id 查详情（v5 place/detail），补齐 inputtips 候选缺的 business 字段。
    查不到或高德报错抛 RuntimeError。"""
    pois = _call(DETAIL_URL, {"key": AMAP_KEY, "id": poi_id, "show_fields": SHOW_FIELDS})
    if not pois:
        raise RuntimeError(f"高德查不到 poi {poi_id}")
    return pois[0]


def regeo(location: str) -> dict:
    """反向地理编码：'lng,lat' → {city, district, province}。失败抛 RuntimeError。

    注意：直辖市（北京/上海/重庆/天津）的 city 字段返回空数组 []，此时回退到 province。
    """
    data = _get(REGEO_URL, {"key": AMAP_KEY, "location": location})
    comp = (data.get("regeocode") or {}).get("addressComponent") or {}

    def _s(v):  # 高德空值常是 []，统一成字符串
        return v if isinstance(v, str) else ""

    province = _s(comp.get("province"))
    city = _s(comp.get("city")) or province          # 直辖市 city 为空 → 用 province
    district = _s(comp.get("district"))
    if city.endswith("市"):                            # "成都市" → "成都"，贴合用户心智
        city = city[:-1]
    return {"city": city, "district": district, "province": province}


def poi_to_store(poi: dict) -> Store:
    business = poi.get("business") or {}
    photos = poi.get("photos") or []
    location = poi.get("location", "")
    lng, lat = 0.0, 0.0
    if location and "," in location:
        try:
            lng, lat = map(float, location.split(","))
        except ValueError:
            pass

    type_full = poi.get("type", "")
    type_name = type_full.split(";")[-1] if type_full else ""

    return Store(
        poi_id=poi.get("id", ""),
        name=poi.get("name", ""),
        typecode=poi.get("typecode", ""),
        type_name=type_name,
        tag=business.get("tag", "") or business.get("keytag", ""),
        rating=str(business.get("rating", "") or ""),
        cost=str(business.get("cost", "") or ""),
        business_area=business.get("business_area", ""),
        province=poi.get("pname", ""),
        city=poi.get("cityname", ""),
        district=poi.get("adname", ""),
        address=poi.get("address", ""),
        lng=lng, lat=lat,
        opentime=business.get("opentime_today", "") or business.get("opentime_week", ""),
        tel=business.get("tel", ""),
        amap_photos="|".join(p.get("url", "") for p in photos if p.get("url")),
    )


def format_poi_brief(poi: dict) -> str:
    """给用户挑店时一行展示。"""
    business = poi.get("business") or {}
    return (
        f"{poi.get('name','?')} "
        f"[{business.get('tag','')}] "
        f"⭐{business.get('rating','-')} ¥{business.get('cost','-')}/人 "
        f"@ {poi.get('pname','')}{poi.get('cityname','')}{poi.get('adname','')} {poi.get('address','')}"
    )
