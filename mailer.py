"""邮件发送：阿里云邮件推送（DirectMail）SMTP —— smtplib + SSL(465)。

未配 SMTP 凭证（MAIL_FROM / MAIL_SMTP_PASSWORD）时进 **dev 模式**：不真发，
把验证码记进日志，方便本地/未配置环境端到端联调；配好 .env 后自动切真发。
"""
from __future__ import annotations

import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

logger = logging.getLogger("foodmap.mailer")

SMTP_HOST = os.environ.get("MAIL_SMTP_HOST", "smtpdm.aliyun.com")
SMTP_PORT = int(os.environ.get("MAIL_SMTP_PORT", "465"))
MAIL_FROM = os.environ.get("MAIL_FROM", "").strip()         # 发信地址（= SMTP 认证用户名）
MAIL_PASSWORD = os.environ.get("MAIL_SMTP_PASSWORD", "")    # 该发信地址的 SMTP 密码
MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "饼饼の美食地图")

_PURPOSE_CN = {"register": "注册", "reset": "重置密码"}


def mail_enabled() -> bool:
    """发信地址 + SMTP 密码都配齐才真发；否则走 dev 模式（日志打码）。"""
    return bool(MAIL_FROM and MAIL_PASSWORD)


def _build_message(to_email: str, code: str, purpose: str) -> EmailMessage:
    label = _PURPOSE_CN.get(purpose, "验证")
    msg = EmailMessage()
    msg["Subject"] = f"【吃了么】{label}验证码 {code}"
    msg["From"] = formataddr((MAIL_FROM_NAME, MAIL_FROM))  # 地址部分必须 = 认证发信地址
    msg["To"] = to_email
    msg.set_content(
        f"你正在{label}「吃了么 · 饼饼の美食地图」。\n\n"
        f"验证码：{code}\n"
        f"10 分钟内有效，请勿泄露给他人。\n\n"
        f"如果不是你本人操作，忽略这封邮件即可。"
    )
    msg.add_alternative(
        f"""\
<div style="font-family:-apple-system,system-ui,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#3d2b1a">
  <h2 style="margin:0 0 12px">🍜 吃了么 · 饼饼の美食地图</h2>
  <p style="margin:0 0 16px">你正在<b>{label}</b>，验证码：</p>
  <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#fcf6ed;border:2px solid #3d2b1a;border-radius:12px;padding:14px 0;text-align:center">{code}</div>
  <p style="margin:16px 0 0;font-size:13px;color:#8a7a66">10 分钟内有效，请勿泄露。不是你本人操作请忽略。</p>
</div>""",
        subtype="html",
    )
    return msg


def send_code(to_email: str, code: str, purpose: str = "register") -> None:
    """发验证码邮件。dev 模式下只记日志、不抛错；真发失败会抛异常给上层处理。"""
    if not mail_enabled():
        logger.warning(
            "【dev模式·邮件未配置】发往 %s 的%s验证码：%s",
            to_email, _PURPOSE_CN.get(purpose, ""), code,
        )
        return
    msg = _build_message(to_email, code, purpose)
    ctx = ssl.create_default_context()
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=ctx, timeout=15) as s:
            s.login(MAIL_FROM, MAIL_PASSWORD)
            s.send_message(msg)
    else:  # 25 / 80 / 587 走 STARTTLS
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls(context=ctx)
            s.login(MAIL_FROM, MAIL_PASSWORD)
            s.send_message(msg)
    logger.info("验证码已发往 %s (%s)", to_email, purpose)
