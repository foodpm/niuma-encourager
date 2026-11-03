-- 牛马鼓励器官网 · D1 表结构
-- 执行：npx wrangler d1 execute niuma-stats --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS downloads (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL,             -- ISO8601 UTC，如 2026-01-01T08:00:00.000Z
  platform TEXT NOT NULL,             -- 'macos' | 'windows'
  version  TEXT NOT NULL DEFAULT 'unknown',
  ip_hash  TEXT NOT NULL,             -- sha-256(CF-Connecting-IP) hex，仅用于去重/UV
  ua       TEXT NOT NULL DEFAULT ''
);

-- 埋点口径 §11.3：download 事件按 (platform, ts) 聚合查询
CREATE INDEX IF NOT EXISTS idx_downloads_platform_ts ON downloads (platform, ts);
-- 今日独立 IP / 去重查询
CREATE INDEX IF NOT EXISTS idx_downloads_ip_hash ON downloads (ip_hash, ts);
