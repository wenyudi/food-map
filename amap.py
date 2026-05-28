"""高德 POI 2.0 查询封装

只暴露两个函数：
  search_poi(keywords, region/location)  → 候选列表（top 3 让用户挑）
  poi_to_store(poi)                      → 归一化为 Store dataclass
"""
from __future__ import annotations

import os
from typing import Optional

import requests

from storage import Store

AMAP_KEY = os.environ.get("AMAP_KEY", "")

SEARCH_URL = "https://restapi.amap.com/v5/place/text"
AROUND_URL = "https://restapi.amap.com/v5/place/around"
SHOW_FIELDS = "business,photos,children,navi"


def _call(url: str, params: dict) -> list[dict]:
    resp = requests.get(url, params=params, timeout=10)
    data = resp.json()
    if data.get("status") != "1":
        raise RuntimeError(f"高德 API 报错：{data.get('info')} (code={data.get('infocode')})")
    return data.get("pois", []) or []


def search_poi(keywords: str, region: Optional[str] = None, location: Optional[str] = None,
               limit: int = 5, around_radius: int = 5000) -> list[dict]:
    """搜店铺。

    优先级：
      1. 有 location → 先周边搜（around_radius 米），结果会按距离排序
      2. 周边没结果（或没有 location）→ region 全市搜
      3. 都没有 → 全国搜
    """
    common = {"key": AMAP_KEY, "keywords": keywords, "show_fields": SHOW_FIELDS, "page_size": limit}

    # 1. 周边优先
    if location:
        pois = _call(AROUND_URL, {**common, "location": location, "radius": around_radius})
        if pois:
            return pois

    # 2. region fallback
    if region:
        return _call(SEARCH_URL, {**common, "region": region, "city_limit": "true"})

    # 3. 全国搜
    return _call(SEARCH_URL, common)


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
