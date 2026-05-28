"""向后兼容：旧代码用 `import storage`，实际转发到 db.py（SQLite）。"""
from db import *  # noqa: F401, F403
from db import (  # 显式列出 dataclass/常量，方便 IDE 检索
    Store, Visit, Wish,
    DATA_FILE,
    upsert_store, add_visit, add_wish,
    find_open_wish_by_poi, mark_wish_visited,
    load_all, list_recent_visits, list_open_wishes, stats,
    compute_value_label,
)
