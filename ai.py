"""DeepSeek 一句话解析：把自然语言变成结构化字段。

输入："昨晚和饼饼去格特士吃了 200，菜偏甜"
输出：{intent, store_hint, date, meal_period, companions, amount, people_count,
       feeling, mood_emoji, want_again, source, reason}
"""
from __future__ import annotations

import json
import os
from datetime import datetime

import requests

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_KEY", "")
API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"

SYSTEM_PROMPT = """你是「馋图」美食记录助手。用户会用一句话描述刚吃完的店或想种草的店。
只输出 JSON，按字段提取，不要解释。

字段：
- intent: "visit"(已经吃过) | "wish"(想去/种草)
- store_hint: 店名关键词
- date: ISO 日期 YYYY-MM-DD（visit 必填；"昨晚"=昨天日期；"今天"=今天日期；没说就填今天）
- meal_period: "早" | "中" | "晚" | null
- companions: 同行人；没说就填 null（不要瞎猜）
- amount: 总花费数字；没说 null
- people_count: 人数；没说 null
- feeling: 复述用户的感受句子（用户原话）；没说 null
- mood_emoji: 从语气推断
   "太香/绝了/yyds/巨好吃" → "😋"
   "好吃/不错/推荐" → "🤤"
   "一般/凑合/还行/偏甜偏咸偏腻" → "😂"
   "踩雷/难吃/不喜欢/不会再来" → "😐"
   不确定 → null
- want_again: true/false；"想再来"=true；"不会再来/雷"=false；不确定 null
- source: "小红书"|"抖音"|"朋友"|"路过"|"手填"；visit 时填 null
- reason: 种草理由（用户原话）；visit 时填 null

只输出 JSON，不要任何 markdown、不要 ``` 包裹。"""


STORY_SYSTEM_PROMPT = """你是「馋图」的回忆录助手。

用户会给你一份**本月吃过的店清单**和**想去清单**，请基于这份清单写一段 80-130 字的温暖小记，像日记里写的回忆。

⚠️ 硬规则（违反就算失败，必须严格遵守）：
- 你**只能**引用我列出的店和它们对应的细节
- **不允许**虚构任何店名、菜品、情节、感受
- 写故事前先在心里检查：这家店在清单里吗？没有就不能写
- 引用"感受"时只能用清单里那家店的原话（在引号里），不能改写也不能 mix

写作要求：
- 第二人称"你"开头；如果清单里出现了同行人，就自然带上（比如"你和 XX"），没有就只说"你"
- 自然口语，不堆砌数据（次数/总花费已经在卡片上显示了，别重复）
- 抓 1-2 个有故事感的细节，按优先级：
  1. 标记 ✨ 兑现 的店 → "种草 N 个月，终于去了"
  2. 同店出现多次 → 抓评价变化
  3. "比官方便宜" / "比官方贵" 标签 → 性价比感叹
  4. 想去清单还没去的 → 留白展望
- 末尾可以给一句"周末把 XX 也勾掉？"之类的展望，XX 必须来自想去清单
- 不要 emoji、不要"哇/好棒/满满的爱/幸福"等过度感叹
- 输出纯文本（不要 markdown 标题或列表）"""


def generate_monthly_story(brief: str, timeout: int = 60) -> str:
    """传入 markdown 格式的当月清单，返回一段叙事文字。"""
    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": STORY_SYSTEM_PROMPT},
                {"role": "user", "content": brief},
            ],
            "temperature": 0.5,  # 适中——既有叙事感又不至于编
        },
        timeout=timeout,
    )
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"DeepSeek 报错：{data['error']}")
    return data["choices"][0]["message"]["content"].strip()


def parse_one_liner(text: str, timeout: int = 30) -> dict:
    today = datetime.now().strftime("%Y-%m-%d")
    weekday = "一二三四五六日"[datetime.now().weekday()]

    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": f"{SYSTEM_PROMPT}\n\n今天是 {today}（周{weekday}）。"},
                {"role": "user", "content": text},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=timeout,
    )
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"DeepSeek 报错：{data['error']}")
    content = data["choices"][0]["message"]["content"]
    return json.loads(content)
