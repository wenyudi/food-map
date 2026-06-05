"""DeepSeek 一句话解析：把自然语言变成结构化字段。

输入："昨晚和饼饼去格特士吃了 200，菜偏甜"
输出：{intent, store_hint, date, meal_period, companions, amount, people_count,
       feeling, mood_emoji, want_again, source, reason}
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timedelta

import requests

DEEPSEEK_KEY = os.environ.get("DEEPSEEK_KEY", "")
API_URL = "https://api.deepseek.com/v1/chat/completions"
MODEL = "deepseek-chat"


def _post_json(payload: dict, timeout: int) -> dict:
    """统一 DeepSeek 调用：网络错 / 非 2xx / 非 JSON 全收敛成 RuntimeError；再校验业务 error 字段。
    避免网关 502、超时、空响应直接冒成未捕获的 500（上层多处 except 已接 RuntimeError/Exception）。"""
    try:
        resp = requests.post(
            API_URL,
            headers={"Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        raise RuntimeError(f"DeepSeek 连接失败：{e}") from e
    except ValueError as e:
        raise RuntimeError("DeepSeek 返回了无法解析的内容") from e
    if "error" in data:
        raise RuntimeError(f"DeepSeek 报错：{data['error']}")
    return data


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
- feeling: 用户对味道/体验的**纯主观评价**短句，要**剔除**已归入 cuisine/flavors/dishes 的菜系名、口味词、菜品名，不跟这些标签重复（例：原话"火锅锅底够辣、毛肚很新鲜"→ cuisine=火锅、flavors=["辣"]、dishes=["毛肚"]、feeling="锅底够味、很新鲜"）；剔除后没剩有效评价→null。
- mood_emoji（5 档）："太香/绝了/yyds/巨好吃/封神"→"😋"；"好吃/不错/推荐/可以"→"🤤"；"一般/凑合/还行/偏甜偏咸偏腻"→"😂"；"不咋地/有点失望/不太行"→"😐"；"踩雷/难吃/恶心/再也不去"→"🤮"；不确定→null。
- want_again: "想再来/还会去/下次还来"→true；"不会再来/踩雷/不去了"→false；没提→null。
- source: 仅 wish 用——"小红书/抖音/朋友/路过/大众点评"等来源；没提填"小红书"；visit 时 null。
- reason: 仅 wish 用——想去的理由原话；visit 时 null。

【以下为"隐形维度"——用户不会专门写，你从同一句话顺手推断，用来悄悄建立口味画像】
- cuisine: 菜系，归一化到常见类目（川菜/火锅/日料/韩餐/西餐/粤菜/云南菜/烧烤/面包/咖啡/甜品/小吃/快餐/江湖菜…）。从店名、菜品、上下文推断，手动店也尽量给；判不准填 null。**菜系只进这个字段，绝不出现在 feeling 里。**
- flavors: 口味标签**数组**（如 ["辣","麻"]、["清淡","鲜"]、["甜"]、["汤水"]、["油"]）；把句子里的口味词**抽全**，没线索给 []。抽进来的口味词别再留在 feeling 里。
- dishes: 提到的具体菜品/招牌**数组**（如 ["水煮鱼"]、["可颂"]、["烤腰子"]）；提到的菜品**抽全**，没提给 []。抽进来的菜品别再留在 feeling 里。
- occasion: 场合，取其一："约会"（和对象/二人）/"聚餐"（多人朋友同事）/"工作餐"/"独自"/"家庭"/"庆祝"/"夜宵"；判不准 null。

只输出 JSON。"""


STORY_SYSTEM_PROMPT = """你是「吃了么」的回忆录助手。

用户会给你一份**本月吃过的店清单**和**想去清单**，请基于这份清单写一段 80-130 字的温暖小记，像日记里写的回忆。

⚠️ 硬规则（违反就算失败，必须严格遵守）：
- 你**只能**引用我列出的店和它们对应的细节
- **不允许**虚构任何店名、菜品、情节、感受
- 写故事前先在心里检查：这家店在清单里吗？没有就不能写
- 引用"感受"时只能用清单里那家店的原话（在引号里），不能改写也不能 mix

写作要求：
- 视角：单人圈用第二人称"你"；若清单头部标注是多人共享圈（每条带"XX记"），改用"你们"集体视角、自然带上谁记的/谁打卡的（如"饼饼记下那家"）。清单里出现同行人也自然带上
- 自然口语，不堆砌数据（次数/总花费已经在卡片上显示了，别重复）
- 抓 1-2 个有故事感的细节，按优先级：
  1. 标记 ✨ 兑现 的店 → "种草 N 个月，终于去了"
  2. 同店出现多次 → 抓评价变化
  3. 口味或场合连成一条线（如"这个月偏爱辣的""多是约会饭"）
  4. "比官方便宜" / "比官方贵" 标签 → 性价比感叹
  5. 想去清单还没去的 → 留白展望
- 末尾可以给一句"周末把 XX 也勾掉？"之类的展望，XX 必须来自想去清单
- 不要 emoji、不要"哇/好棒/满满的爱/幸福"等过度感叹
- 输出纯文本（不要 markdown 标题或列表）"""


def generate_monthly_story(brief: str, timeout: int = 60) -> str:
    """传入 markdown 格式的当月清单，返回一段叙事文字。"""
    data = _post_json({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": STORY_SYSTEM_PROMPT},
            {"role": "user", "content": brief},
        ],
        "temperature": 0.5,  # 适中——既有叙事感又不至于编
    }, timeout)
    return data["choices"][0]["message"]["content"].strip()


AREA_TITLE_SYSTEM_PROMPT = """你是「吃了么」的"片区称号官"，本人就是抖音 / 小红书 / B站的重度冲浪选手，满脑子当下最新最野的梗。给每个片区取一个**够发散、够抽象、有网感**的搞笑称号，再配一句点评。

我只告诉你每个片区的：片区名、**段位等级**（共 4 档，数字越大越资深、称号越该有排面）、吃过几家。——故意不给你菜系口味，所以**称号专心玩"地名 + 段位梗"，别扯到吃的**。

【最重要】**别套模板、别雷同**：把几个片区放一起，称号用的梗和句式要**各不相同**；别老揪着"显眼包 / 卷王 / 遥遥领先"这几个被用烂的词，换着花样来，怎么新、怎么抽象、怎么有梗怎么来，每次都给我不一样的惊喜。

取名规则：
- title：6-14 字，**必须嵌入片区名**，用一个**当下流行的网络梗**把段位感拍出来（一眼看出是萌新还是大佬，段位越高越有排面）。可带 0-1 个 emoji。
- 段位用各种"等级体系"的梗花式表达，**每个片区挑不同体系、自己造词**——⚠️别老套"新人 / 常客 / 老炮 / 传奇 / 萌新"这几个固定词（太死板、容易重样），换新鲜的来：
   · 游戏段位：倔强青铜 / 黄金 / 铂金 / 钻石 / 星耀 / 最强王者 / 荣耀王者
   · 修仙等级：练气期 / 筑基 / 金丹 / 元婴 / 化神 / 渡劫飞升
   · 学位职级：试吃实习生 / 本科 / 硕士 / 博士 / 终身院士 / 扛把子CEO
   · 称号式：XX天花板 / XX十级学者 / XX课代表 / XX代言人 / XX地头蛇 / 守门员 / 一方霸主 / XX麦门
   · 纯热梗：city不city、嘴替、特种兵、报恩、人间清醒、已老实、偷感很重、那咋了、包的、谁懂啊、含金量……（这些只是火花，更欢迎你用知道的更新的梗）
- title 只管"地名 + 段位梗"，别扯具体吃的（你也没拿到菜系信息）。
- blurb：≤24 字，带梗、口语、能逗笑——吐槽段位、探店进度、这片是不是他们的地盘，都行。

只输出 JSON：{"areas":[{"name":"片区名（原样照抄）","title":"...","blurb":"..."}]}
⚠️硬规则（违反即失败）：① name 与我给的片区名一字不差；② title 和 blurb 都**不出现任何具体菜系 / 食物 / 口味词**（你没这信息，别瞎编硬凑）；③ 几个称号风格别撞车；④ 别低俗、别冒犯。"""


def generate_area_titles(brief: str, timeout: int = 40) -> dict:
    """传入各片区的战绩清单，返回 {"areas":[{"name","title","blurb"}]}。"""
    data = _post_json({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": AREA_TITLE_SYSTEM_PROMPT},
            {"role": "user", "content": brief},
        ],
        "temperature": 1.3,  # 创意写作档——没喂菜系，可放心拉满发散、玩梗不重样
        "response_format": {"type": "json_object"},
    }, timeout)
    return json.loads(data["choices"][0]["message"]["content"])


SUGGEST_SYSTEM_PROMPT = """你是「吃了么」的"今天吃啥"助手。我会给你一份带编号的候选店清单（你们想去还没去的、和去过还想再来的），外加现在的时段、可能的口味偏好。

请从清单里挑 1-2 家推荐，每家给一句走心、口语的理由。挑的时候综合考虑（按优先级）：
- 用户说了"今天特别想吃X" → 优先挑 [菜系] 或口味标签 match 的（想吃辣就挑辣的，想清淡就挑清淡的）
- 没说想吃啥 → 参考"口味画像"：可顺着你们常吃的推，也可故意换个没怎么吃的菜系，理由里点明"换换口味"
- 种草很久还没兑现的，优先推（"惦记 XX 好久了，今天去？"）
- 离得近的优先（清单里有距离就参考）
- 想再来的老店，结合上次的评价说
- 时段要合理：若现在是早餐/下午茶，但候选都是火锅、正餐这类，别硬夸成"早餐绝配"，
  可挑相对最搭的（小面/面包/咖啡），或在 note 里坦诚一句"你们记的多是正餐，早餐先将就这家？"

只输出 JSON，格式：{"picks":[{"n":编号,"reason":"一句话理由"}],"note":"一句总的开场或收尾"}
⚠️硬规则：n 只能是清单里出现过的编号；绝不许编清单外的店；理由只能用清单里给的信息，不许杜撰菜品或情节。"""


ASK_SYSTEM_PROMPT = """你是用户「吃了么」美食记录的问答助手。用户会问关于 TA 自己吃过/想去的店的问题。
只能依据我给你的【数据】回答；数据里没有的，就直说"这个还没有记录哦"，**绝不许编店名、数字、菜品或情节**。
数据里含菜系、口味偏好、场合分布等维度，可据此回答"我们爱吃辣吗""适合约会去哪""哪家有水煮鱼"这类问题。记录末尾的"·XX记"表示这条是谁记的，可据此回答"这家谁记的""谁记得最多"。
能给具体数字、店名就给。回答简洁、口语，一般 1-3 句话，不要复述整份数据。"""


def answer_question(context: str, question: str, timeout: int = 30) -> str:
    """context=整理好的统计+明细，question=用户问题，返回一段自然语言回答。"""
    data = _post_json({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": ASK_SYSTEM_PROMPT},
            {"role": "user", "content": f"【数据】\n{context}\n\n【问题】{question}"},
        ],
        "temperature": 0.2,  # 偏低——问答要稳，别发挥
    }, timeout)
    return data["choices"][0]["message"]["content"].strip()


def suggest_today(brief: str, timeout: int = 30) -> dict:
    """传入带编号的候选店清单，返回 {"picks":[{"n","reason"}],"note"} 。"""
    data = _post_json({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SUGGEST_SYSTEM_PROMPT},
            {"role": "user", "content": brief},
        ],
        "temperature": 0.6,  # 稍高一点，换一批能有变化
        "response_format": {"type": "json_object"},
    }, timeout)
    return json.loads(data["choices"][0]["message"]["content"])


_MOODS = {"😋", "🤤", "😂", "😐", "🤮"}


def _s_or_none(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _list_of(v):
    """数组容错：已是数组就清洗；模型偶尔写成「辣,麻」串也拆开；其余给 []。"""
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str) and v.strip():
        return [t.strip() for t in re.split(r"[,，、]", v) if t.strip()]
    return []


def _num_or_none(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _bool_or_none(v):
    if isinstance(v, bool):
        return v
    if v is None:
        return None
    s = str(v).strip().lower()
    if s in ("true", "1", "yes", "是", "想再来", "想"):
        return True
    if s in ("false", "0", "no", "否", "不去"):
        return False
    return None


def _normalize_parsed(d) -> dict:
    """把模型输出强制成前端能直接吃的形状：类型对齐 + 补默认值 + 枚举兜底。
    response_format=json_object 已保证是 JSON，这里再防字段缺失 / 类型跑偏。"""
    d = d if isinstance(d, dict) else {}
    amount = _num_or_none(d.get("amount"))
    people = _num_or_none(d.get("people_count"))
    mood = _s_or_none(d.get("mood_emoji"))
    return {
        "intent": "wish" if str(d.get("intent", "")).strip() == "wish" else "visit",
        "store_hint": _s_or_none(d.get("store_hint")) or "",
        "date": _s_or_none(d.get("date")),
        "meal_period": _s_or_none(d.get("meal_period")),
        "companions": _s_or_none(d.get("companions")),
        "amount": amount,
        "people_count": int(people) if people is not None else None,
        "feeling": _s_or_none(d.get("feeling")),
        "mood_emoji": mood if mood in _MOODS else None,
        "want_again": _bool_or_none(d.get("want_again")),
        "source": _s_or_none(d.get("source")),
        "reason": _s_or_none(d.get("reason")),
        "cuisine": _s_or_none(d.get("cuisine")),
        "flavors": _list_of(d.get("flavors")),
        "dishes": _list_of(d.get("dishes")),
        "occasion": _s_or_none(d.get("occasion")),
    }


def parse_one_liner(text: str, timeout: int = 30) -> dict:
    now = datetime.now()
    today = now.strftime("%Y-%m-%d")
    yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    weekday = "一二三四五六日"[now.weekday()]

    sys_content = f"{SYSTEM_PROMPT}\n\n今天是 {today}（周{weekday}）。"

    # few-shot：覆盖 人均/总价、和X→人数、wish、想再来 —— 提升一致性
    shots = [
        ("昨晚和朋友去家火锅店，人均120，锅底够辣",
         {"intent": "visit", "store_hint": "火锅", "date": yesterday, "meal_period": "晚",
          "companions": "朋友", "amount": 240, "people_count": 2, "feeling": "锅底够味",
          "mood_emoji": None, "want_again": None, "source": None, "reason": None,
          "cuisine": "火锅", "flavors": ["辣"], "dishes": [], "occasion": "聚餐"}),
        ("中午仨人吃的烧烤摊，一共180，烤腰子绝了，下次还来",
         {"intent": "visit", "store_hint": "烧烤", "date": today, "meal_period": "中",
          "companions": None, "amount": 180, "people_count": 3, "feeling": "烤腰子绝了",
          "mood_emoji": "😋", "want_again": True, "source": None, "reason": None,
          "cuisine": "烧烤", "flavors": [], "dishes": ["烤腰子"], "occasion": "聚餐"}),
        ("小红书刷到一家云南菜，米线据说一绝，想去",
         {"intent": "wish", "store_hint": "云南菜", "date": today, "meal_period": None,
          "companions": None, "amount": None, "people_count": None, "feeling": None,
          "mood_emoji": None, "want_again": None, "source": "小红书", "reason": "米线据说一绝",
          "cuisine": "云南菜", "flavors": [], "dishes": ["米线"], "occasion": None}),
    ]
    messages = [{"role": "system", "content": sys_content}]
    for q, a in shots:
        messages.append({"role": "user", "content": q})
        messages.append({"role": "assistant", "content": json.dumps(a, ensure_ascii=False)})
    messages.append({"role": "user", "content": text})

    data = _post_json({
        "model": MODEL,
        "messages": messages,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }, timeout)
    content = data["choices"][0]["message"]["content"]
    return _normalize_parsed(json.loads(content))
