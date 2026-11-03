import { json, safeEqual, beijingDayStartISO, beijingDateISO, type Env, type StatsResponse, type PlatformStat } from '../types';

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const token = (env.ADMIN_TOKEN || '').trim();
  if (!token) return json({ ok: false, error: 'ADMIN_TOKEN not configured' }, 500);

  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m || !(await safeEqual(m[1].trim(), token))) {
    return json({ ok: false, error: 'unauthorized' }, 401, { 'WWW-Authenticate': 'Bearer' });
  }

  const todayStart = beijingDayStartISO(0);
  const weekStart = beijingDayStartISO(-6);

  const countAll = env.DB.prepare('SELECT COUNT(*) AS n FROM downloads').first<{ n: number }>();
  const countToday = env.DB.prepare('SELECT COUNT(*) AS n FROM downloads WHERE ts >= ?1').bind(todayStart).first<{ n: number }>();
  const countWeek = env.DB.prepare('SELECT COUNT(*) AS n FROM downloads WHERE ts >= ?1').bind(weekStart).first<{ n: number }>();
  const uvToday = env.DB
    .prepare('SELECT COUNT(DISTINCT ip_hash) AS n FROM downloads WHERE ts >= ?1')
    .bind(todayStart)
    .first<{ n: number }>();
  const byPlatform = env.DB
    .prepare(
      `SELECT platform, version, COUNT(*) AS count
       FROM downloads GROUP BY platform, version
       ORDER BY count DESC`,
    )
    .all<{ platform: string; version: string; count: number }>();
  const dailyRows = env.DB    .prepare(
      `SELECT substr(ts, 1, 10) AS utc_day, platform, COUNT(*) AS count
       FROM downloads
       WHERE ts >= ?1
       GROUP BY utc_day, platform`,
    )
    .bind(beijingDayStartISO(-13))
    .all<{ utc_day: string; platform: string; count: number }>();

  const [all, today, week, uv, plats, dailyRes] = await Promise.all([
    countAll, countToday, countWeek, uvToday, byPlatform, dailyRows,
  ]);

  const perPlatform = (base?: { n: number } | null, extra?: { macos: number; windows: number }): PlatformStat => ({
    all: base?.n ?? 0,
    macos: extra?.macos ?? 0,
    windows: extra?.windows ?? 0,
  });

  // 按平台拆分（单独聚合，避免一次查询返回过多列）
  const split = async (sinceISO: string | null): Promise<{ macos: number; windows: number }> => {
    const q = sinceISO
      ? env.DB.prepare("SELECT platform, COUNT(*) AS n FROM downloads WHERE ts >= ?1 GROUP BY platform").bind(sinceISO)
      : env.DB.prepare('SELECT platform, COUNT(*) AS n FROM downloads GROUP BY platform');
    const rows = await q.all<{ platform: string; n: number }>();
    const out = { macos: 0, windows: 0 };
    for (const r of rows.results || []) {
      if (r.platform === 'macos') out.macos = r.n;
      else if (r.platform === 'windows') out.windows = r.n;
    }
    return out;
  };

  const [allSplit, todaySplit, weekSplit] = await Promise.all([
    split(null), split(todayStart), split(weekStart),
  ]);

  // 14 天序列（UTC+8 口径，缺数补 0）
  const dailyMap = new Map<string, { macos: number; windows: number }>();
  for (const r of dailyRes.results || []) {
    // ts 为 UTC ISO，substr(1,10) 为 UTC 日期；转 UTC+8 日期：
    const shifted = new Date(`${r.utc_day}T00:00:00Z`).getTime() + 8 * 3600_000;
    const bjDay = new Date(shifted).toISOString().slice(0, 10);
    const entry = dailyMap.get(bjDay) || { macos: 0, windows: 0 };
    if (r.platform === 'macos') entry.macos += r.count;
    else if (r.platform === 'windows') entry.windows += r.count;
    dailyMap.set(bjDay, entry);
  }
  const daily: StatsResponse['daily'] = [];
  for (let i = -13; i <= 0; i++) {
    const d = beijingDateISO(i);
    const e = dailyMap.get(d) || { macos: 0, windows: 0 };
    daily.push({ date: d, macos: e.macos, windows: e.windows });
  }

  const body: StatsResponse = {
    ok: true,
    totals: perPlatform(all, allSplit),
    today: perPlatform(today, todaySplit),
    week: perPlatform(week, weekSplit),
    todayUniqueIps: uv?.n ?? 0,
    byPlatform: (plats.results || []).map((r) => ({
      platform: (r.platform === 'windows' ? 'windows' : 'macos') as 'macos' | 'windows',
      version: r.version || 'unknown',
      count: r.count,
    })),
    daily,
  };
  return json(body);
};
