/// <reference types="@cloudflare/workers-types" />

/** 下载平台（与 /api/dl/[platform] 路由参数一致） */
export type Platform = 'macos' | 'windows';

/** Pages Functions 绑定（wrangler.toml / Dashboard 配置） */
export interface Env {
  /** D1 数据库绑定 */
  DB: D1Database;
  /** GitHub 仓库，如 "OWNER/niuma-encourager" */
  RELEASE_REPO: string;
  /** GitHub API 基地址（默认 https://api.github.com，可指向镜像；测试用） */
  GITHUB_API_BASE?: string;
  /** 管理后台 Token（生产为 secret，本地 .dev.vars） */
  ADMIN_TOKEN?: string;
}

/** downloads 表一行 */
export interface DownloadRow {
  id: number;
  /** ISO8601 UTC */
  ts: string;
  platform: Platform;
  version: string;
  /** sha-256(CF-Connecting-IP) 十六进制 */
  ip_hash: string;
  ua: string;
}

/** /api/stats 响应体 */
export interface StatsResponse {
  ok: boolean;
  totals: PlatformStat;
  today: PlatformStat;
  week: PlatformStat;
  todayUniqueIps: number;
  byPlatform: { platform: Platform; version: string; count: number }[];
  daily: { date: string; macos: number; windows: number }[];
}

export interface PlatformStat {
  all: number;
  macos: number;
  windows: number;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

export function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', data).then((digest) =>
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  );
}

/** 恒时比较（先哈希再比对，避免时序侧信道） */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  if (a.length === 0 || b.length === 0) return false;
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  return ha === hb;
}

/** UTC+8 的「今天 0 点」对应的 UTC ISO 串（与 ts 列直接做字符串比较） */
export function beijingDayStartISO(offsetDays = 0): string {
  const shifted = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return new Date(`${y}-${m}-${d}T00:00:00+08:00`).toISOString();
}

/** UTC+8 口径的 YYYY-MM-DD */
export function beijingDateISO(offsetDays = 0): string {
  const shifted = new Date(Date.now() + 8 * 3600_000 + offsetDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}
