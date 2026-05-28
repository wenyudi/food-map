"""生成独立 HTML 地图。

技术选型：leaflet + 高德矢量瓦片
  · 无需任何 key 配置（不踩 v2.0 JS API 的 securityJsCode 坑）
  · file:// 双击就能打开
  · 坐标系：高德瓦片 + 高德返回坐标都是 GCJ-02，天然一致，marker 不偏
"""
from __future__ import annotations

import json
from pathlib import Path

import storage

OUT_FILE = Path(__file__).parent / "data" / "饼饼地图.html"

EMOJI_COLOR = {
    "😋": "#ff4757",
    "🤤": "#ffa502",
    "😂": "#7bed9f",
    "😐": "#a4b0be",
}


def _build_points() -> list[dict]:
    data = storage.load_all()
    stores = {s["poi_id"]: s for s in data["stores"]}
    visits_by_poi: dict[str, list[dict]] = {}
    for v in data["visits"]:
        visits_by_poi.setdefault(v["poi_id"], []).append(v)
    wishes_by_poi = {w["poi_id"]: w for w in data["wishes"] if w["status"] == "want"}

    points = []
    for poi_id, store in stores.items():
        if not store.get("lng") or not store.get("lat"):
            continue
        my_visits = visits_by_poi.get(poi_id, [])
        latest = my_visits[-1] if my_visits else None
        emoji = (latest or {}).get("mood_emoji", "")
        points.append({
            "poi_id": poi_id,
            "name": store["name"],
            "lng": store["lng"],
            "lat": store["lat"],
            "address": store["address"],
            "business_area": store["business_area"],
            "tag": store["tag"],
            "rating": store["rating"],
            "cost": store["cost"],
            "opentime": store["opentime"],
            "tel": store["tel"],
            "amap_photos": [p for p in (store["amap_photos"] or "").split("|") if p],
            "status": "visited" if my_visits else "want",
            "color": EMOJI_COLOR.get(emoji, "#a4b0be"),
            "emoji": emoji or "🤍",
            "visit_count": len(my_visits),
            "visits": my_visits,
            "wish": wishes_by_poi.get(poi_id),
        })
    return points


HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>饼饼の美食地图</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html,body { margin:0; padding:0; height:100%; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  #app { display:flex; height:100vh; }
  #map { flex:1; background:#eee; }
  #sidebar { width:300px; background:#fafafa; border-left:1px solid #eee; overflow-y:auto; padding:18px; box-sizing:border-box; }
  h2 { margin:0 0 12px; font-size:18px; color:#222; }
  h3 { margin:18px 0 8px; font-size:13px; color:#888; font-weight:500; }
  .stat { display:flex; gap:8px; margin-bottom:12px; font-size:13px; }
  .stat span { background:#fff; padding:6px 10px; border-radius:14px; flex:1; text-align:center; }
  .recent-row { background:#fff; padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:12px; line-height:1.6; }
  .recent-row .name { font-weight:500; color:#333; }
  .recent-row .meta { color:#888; font-size:11px; }
  .empty { color:#aaa; font-size:12px; padding:8px 0; }

  .marker-dot {
    display:flex; align-items:center; justify-content:center;
    width:36px; height:36px; border-radius:50%;
    box-shadow:0 2px 8px rgba(0,0,0,0.25);
    font-size:20px; border:3px solid #fff;
    cursor:pointer;
  }
  .marker-dot.want { background:#fff !important; border-color:#bbb; opacity:0.85; }

  .leaflet-popup-content { margin:12px; font-size:13px; line-height:1.6; min-width:240px; }
  .leaflet-popup-content h4 { margin:0 0 4px; font-size:15px; }
  .leaflet-popup-content .meta { color:#888; font-size:12px; margin-bottom:6px; }
  .visit-row { background:#f5f6fa; padding:6px 8px; border-radius:6px; margin-top:6px; }
  .photos img { width:60px; height:60px; object-fit:cover; border-radius:4px; margin:2px; }
  .wish-row { background:#f0f4f8; padding:6px 8px; border-radius:6px; margin-top:6px; border-left:3px solid #c8d6e5; }
</style>
</head>
<body>
<div id="app">
  <div id="map"></div>
  <div id="sidebar">
    <h2>饼饼の美食地图</h2>
    <div class="stat">
      <span>📍 <b id="cnt-visited">0</b> 已去</span>
      <span>🤍 <b id="cnt-want">0</b> 想去</span>
    </div>
    <div class="stat">
      <span>💵 共花 ¥<b id="sum-amount">0</b></span>
    </div>

    <h3>最近吃过</h3>
    <div id="recent"></div>
  </div>
</div>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const POINTS = __POINTS__;

// 统计
const visited = POINTS.filter(p => p.status === 'visited');
const want = POINTS.filter(p => p.status === 'want');
document.getElementById('cnt-visited').textContent = visited.length;
document.getElementById('cnt-want').textContent = want.length;

let totalAmount = 0;
const allVisits = [];
visited.forEach(p => p.visits.forEach(v => {
  totalAmount += Number(v.amount || 0);
  allVisits.push({ ...v, store_name: p.name });
}));
document.getElementById('sum-amount').textContent = totalAmount.toFixed(0);

// 最近 5 次
const recentBox = document.getElementById('recent');
const recent = allVisits.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
if (recent.length === 0) {
  recentBox.innerHTML = '<div class="empty">还没吃过 …</div>';
} else {
  recent.forEach(v => {
    const div = document.createElement('div');
    div.className = 'recent-row';
    div.innerHTML = `<div class="name">${v.mood_emoji||''} ${v.store_name}</div>
                     <div class="meta">${v.date} · ¥${v.per_person}/人 ${v.value_label || ''}${v.want_again ? ' · ⭐' : ''}</div>`;
    recentBox.appendChild(div);
  });
}

// 地图：高德矢量瓦片（GCJ-02 坐标系，与 POI 返回坐标一致）
const center = POINTS.length ? [POINTS[0].lat, POINTS[0].lng] : [29.56, 106.55];
const map = L.map('map', { zoomControl: true }).setView(center, 13);

L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
  subdomains: ['1', '2', '3', '4'],
  attribution: '© 高德地图',
  maxZoom: 18,
}).addTo(map);

POINTS.forEach(p => {
  const isVisited = p.status === 'visited';
  const dotHtml = `<div class="marker-dot${isVisited?'':' want'}" style="background:${isVisited ? p.color : '#fff'}">${p.emoji}</div>`;
  const icon = L.divIcon({ html: dotHtml, className: '', iconSize: [36, 36], iconAnchor: [18, 18] });

  const marker = L.marker([p.lat, p.lng], { icon }).addTo(map);

  const visitsHtml = p.visits.map(v => `
    <div class="visit-row">
      <div>${v.date} ${v.meal_period} · ${v.companions} · ¥${v.per_person}/人 ${v.value_label||''}${v.want_again?' ⭐':''}</div>
      <div>${v.mood_emoji||''} ${v.feeling||''}</div>
    </div>`).join('');

  const wishHtml = p.wish ? `
    <div class="wish-row">🤍 种草：${p.wish.reason || '(无理由)'} <span style="color:#999">· ${p.wish.source}</span></div>` : '';

  const photosHtml = p.amap_photos.length ? `
    <div class="photos">${p.amap_photos.slice(0,3).map(u => `<img src="${u}">`).join('')}</div>` : '';

  const tagShort = (p.tag || '').length > 30 ? p.tag.slice(0, 30) + '…' : p.tag;
  const popup = `<h4>${p.name}</h4>
    <div class="meta">${p.business_area || ''}${tagShort?' · '+tagShort:''}${p.rating?' · ⭐'+p.rating:''}${p.cost?' · ¥'+p.cost+'/人':''}</div>
    <div>${p.address || ''}</div>
    ${photosHtml}
    ${wishHtml}
    ${visitsHtml || '<div class="empty">还没吃过</div>'}`;

  marker.bindPopup(popup, { maxWidth: 320 });
});

if (POINTS.length > 1) {
  const bounds = L.latLngBounds(POINTS.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [50, 50] });
}
</script>
</body>
</html>
"""


def generate() -> Path:
    points = _build_points()
    html = HTML_TEMPLATE.replace("__POINTS__", json.dumps(points, ensure_ascii=False))
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUT_FILE.write_text(html, encoding="utf-8")
    return OUT_FILE
