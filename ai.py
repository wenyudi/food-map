"""DeepSeek 一句话解析：把自然语言变成结构化字段。

输入："昨晚和饼饼去格特士吃了 200，菜偏甜"
输出：{intent, store_hint, date, meal_period, companions, amount, people_count,
       feeling, mood_emoji, want_again, source, reason}
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta

import requests

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_KEY", "")
API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"

SYSTEM_PROMPT = """你是「吃了么」美食记录助手。用户用一句话描述"刚吃过的店"或"想去种草的店"，你把它拆成结构化字段。只输出 JSON，不解释、不加 markdown、不加 ``` 包裹。

字段与规则：
- intent: "visit"=已经吃过（去了/吃了/打卡了/尝了/撸了串/复购）；"wish"=还没去想去（想去/种草/收藏/听说/据说/刷到/看到/改天去/打算去）。判不准时：带过去时/给了金额或评价 → visit；只表达意向 → wish。
- store_hint: 店名或最能搜到这家店的关键词。去掉"那家/一家/店/餐厅"等噪音词；没有具体店名就用招牌菜或菜系当关键词（如"云南菜""日料"）。
- date: ISO 日期 YYYY-MM-DD。"昨天/昨晚"=昨天；"前天"=前天；"今天/今晚/刚"或没提时间=今天。wish 也填今天。
- meal_period: 早饭/早上→"早"；午饭/中午→"中"；晚饭/晚上/夜宵→"晚"；没提→null。
- amount: **总花费**数字（人民币）。
   ⚠️关键：分清"人均"和"总价"——
   · 说"一共/总共/花了X/X块"→ amount=X（总价）。
   · 说"人均X/每人X/AAX"→ 这是单人价：知道人数N就 amount=X×N；**不知道人数就按 2 人算**（amount=X×2, people_count=2）——这样人均显示仍是 X。
- people_count: "和某人/跟某人"→ 至少 2（你 + 对方）；"俩/两个人/两人"→2；"仨/三人"→3；"一个人/自己/独自"→1；没线索→null（但若给了人均，按上面规则补 2）。
- companions: 同行人名字或称呼（如"饼饼""同事""朋友"）；没提→null（别瞎猜）。
- feeling: 用户对味道/体验的原话短句（如"皮薄馅大""锅底够香""偏甜"）；没提→null。
- mood_emoji: "太香/绝了/yyds/巨好吃/封神"→"😋"；"好吃/不错/推荐/可以"→"🤤"；"一般/凑合/还行/偏甜偏咸偏腻"→"😂"；"踩雷/难吃/不喜欢/雷"→"😐"；不确定→null。
- want_again: "想再来/还会去/下次还来"→true；"不会再来/踩雷/不去了"→false；没提→null。
- source: 仅 wish 用——"小红书/抖音/朋友/路过/大众点评"等来源；没提填"小红书"；visit 时 null。
- reason: 仅 wish 用——想去的理由原话；visit 时 null。

只输出 JSON。"""


STORY_SYSTEM_PROMPT = """你是「吃了么」的回忆录助手。

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


SUGGEST_SYSTEM_PROMPT = """你是「吃了么」的"今天吃啥"助手。我会给你一份带编号的候选店清单（你们想去还没去的、和去过还想再来的），外加现在的时段、可能的口味偏好。

请从清单里挑 1-2 家推荐，每家给一句走心、口语的理由。挑的时候综合考虑（按优先级）：
- 种草很久还没兑现的，优先推（"惦记 XX 好久了，今天去？"）
- 用户说的口味偏好（清淡/辣/汤水…）要尽量match
- 离得近的优先（清单里有距离就参考）
- 别老吃同一类，适当换换口味
- 想再来的老店，结合上次的评价说

只输出 JSON，格式：{"picks":[{"n":编号,"reason":"一句话理由"}],"note":"一句总的开场或收尾"}
⚠️硬规则：n 只能是清单里出现过的编号；绝不许编清单外的店；理由只能用清单里给的信息，不许杜撰菜品或情节。"""


ASK_SYSTEM_PROMPT = """你是用户「吃了么」美食记录的问答助手。用户会问关于 TA 自己吃过/想去的店的问题。
只能依据我给你的【数据】回答；数据里没有的，就直说"这个还没有记录哦"，**绝不许编店名、数字、菜品或情节**。
能给具体数字、店名就给。回答简洁、口语，一般 1-3 句话，不要复述整份数据。"""


def answer_question(context: str, question: str, timeout: int = 30) -> str:
    """context=整理好的统计+明细，question=用户问题，返回一段自然语言回答。"""
    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": ASK_SYSTEM_PROMPT},
                {"role": "user", "content": f"【数据】\n{context}\n\n【问题】{question}"},
            ],
            "temperature": 0.2,  # 偏低——问答要稳，别发挥
        },
        timeout=timeout,
    )
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"DeepSeek 报错：{data['error']}")
    return data["choices"][0]["message"]["content"].strip()


def suggest_today(brief: str, timeout: int = 30) -> dict:
    """传入带编号的候选店清单，返回 {"picks":[{"n","reason"}],"note"} 。"""
    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": [
                {"role": "system", "content": SUGGEST_SYSTEM_PROMPT},
                {"role": "user", "content": brief},
            ],
            "temperature": 0.6,  # 稍高一点，换一批能有变化
            "response_format": {"type": "json_object"},
        },
        timeout=timeout,
    )
    data = resp.json()
    if "error" in data:
        raise RuntimeError(f"DeepSeek 报错：{data['error']}")
    return json.loads(data["choices"][0]["message"]["content"])


def parse_one_liner(text: str, timeout: int = 30) -> dict:
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    weekday = "一二三四五六日"[now.weekday()]

    sys_content = f"{SYSTEM_PROMPT}\n\n今天是 {today}（周{weekday}）。"

    # few-shot：覆盖 人均/总价、和X→人数、wish、想再来 —— 提升一致性
    shots = [
        ("昨晚和饼饼去海底捞，人均120",
         {"intent": "visit", "store_hint": "海底捞", "date": yesterday, "meal_period": "晚",
          "companions": "饼饼", "amount": 240, "people_count": 2, "feeling": None,
          "mood_emoji": None, "want_again": None, "source": None, "reason": None}),
        ("中午仨人吃的老王烧烤，一共180，烤腰子绝了，下次还来",
         {"intent": "visit", "store_hint": "老王烧烤", "date": today, "meal_period": "中",
          "companions": None, "amount": 180, "people_count": 3, "feeling": "烤腰子绝了",
          "mood_emoji": "😋", "want_again": True, "source": None, "reason": None}),
        ("小红书刷到一家云南菜，米线据说一绝，想去",
         {"intent": "wish", "store_hint": "云南菜", "date": today, "meal_period": None,
          "companions": None, "amount": None, "people_count": None, "feeling": None,
          "mood_emoji": None, "want_again": None, "source": "小红书", "reason": "米线据说一绝"}),
    ]
    messages = [{"role": "system", "content": sys_content}]
    for q, a in shots:
        messages.append({"role": "user", "content": q})
        messages.append({"role": "assistant", "content": json.dumps(a, ensure_ascii=False)})
    messages.append({"role": "user", "content": text})

    resp = requests.post(
        API_URL,
        headers={
            "Authorization": f"Bearer {DEEPSEEK_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MODEL,
            "messages": messages,
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
