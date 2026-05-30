#!/usr/bin/env bash
# 「吃了么」数据备份：SQLite 热备份 + 照片打包 + 轮转保留。
#
# 用法（在服务器上）：
#   chmod +x scripts/backup.sh
#   ./scripts/backup.sh                      # 手动跑一次
#
# 定时（推荐每天凌晨 4 点）：
#   crontab -e
#   0 4 * * * /opt/food-map/scripts/backup.sh >> /var/log/chiledme-backup.log 2>&1
#
# 可用环境变量覆盖：
#   DATA_DIR   数据目录（docker-compose 的 ./data 卷），默认 /opt/food-map/data
#   BACKUP_DIR 备份输出目录，默认 /opt/food-map/backups
#   KEEP       保留最近多少份，默认 14
#
# ⚠️ 更稳的做法：再把 BACKUP_DIR 同步到异地（另一台机 / 对象存储 OSS），
#    单机磁盘坏了也不怕。例：rclone copy "$BACKUP_DIR" oss:chiledme-backup
set -euo pipefail

DATA_DIR="${DATA_DIR:-/opt/food-map/data}"
BACKUP_DIR="${BACKUP_DIR:-/opt/food-map/backups}"
KEEP="${KEEP:-14}"

DB="$DATA_DIR/food_map.db"
PHOTOS="$DATA_DIR/photos"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/chiledme-$STAMP.tar.gz"

if [ ! -f "$DB" ]; then
  echo "✗ 找不到数据库：$DB（用 DATA_DIR=... 指定正确路径）" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# SQLite 热备份（即便此刻有写入也安全），装了 sqlite3 就用它，否则退回直接拷
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$TMP/food_map.db'"
else
  cp "$DB" "$TMP/food_map.db"
fi
[ -d "$PHOTOS" ] && cp -r "$PHOTOS" "$TMP/photos"

tar -czf "$OUT" -C "$TMP" .
echo "✓ 备份完成：$OUT ($(du -h "$OUT" | cut -f1))"

# 轮转：只保留最近 $KEEP 份
ls -1t "$BACKUP_DIR"/chiledme-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "✓ 已保留最近 $KEEP 份备份"
