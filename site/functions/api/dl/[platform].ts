import { json, sha256Hex, type Env, type Platform } from '../../types';

interface Ctx {
  env: Env;
  params: { platform: string };
  request: Request;
}

const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 同 ip+platform 10 分钟去重
const PLATFORMS: Platform[] = ['macos', 'windows'];

function pickAsset(assets: { name: string; browser_download_url: string }[], platform: Platform): { name: string; url: string } | null {
  if (platform === 'macos') {
    const dmg = assets.find((a) => a.name.toLowerCase().endsWith('.dmg'));
    return dmg ? { name: dmg.name, url: dmg.browser_download_url } : null;
  }
  // Windows：优先给普通用户的 NSIS 安装向导（-setup.exe），msi 作为企业静默部署备选
  const setupExe = assets.find((a) => a.name.toLowerCase().endsWith('-setup.exe'));
  if (setupExe) return { name: setupExe.name, url: setupExe.browser_download_url };
  const msi = assets.find((a) => a.name.toLowerCase().endsWith('.msi'));
  if (msi) return { name: msi.name, url: msi.browser_download_url };
  const exe = assets.find((a) => a.name.toLowerCase().endsWith('.exe'));
  return exe ? { name: exe.name, url: exe.browser_download_url } : null;
}

function versionFromTag(tag: string): string {
  return tag.replace(/^v/i, '') || 'unknown';
}

/** 从 GitHub Release 资产名推断版本，如 NiumaEncourager_1.2.0_aarch64.dmg → 1.2.0 */
function versionFromAssetName(name: string): string {
  const m = name.match(/(\d+\.\d+\.\d+(?:[.\-_]\d+)*)/);
  return m ? m[1] : 'unknown';
}

async function countDownload(env: Env, platform: Platform, ipHash: string, version: string, ua: string): Promise<void> {
  const now = new Date().toISOString();
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  // 埋点口径 §11.3：download 事件，302 前落库；同 ip-hash+platform 10 分钟去重
  const dup = await env.DB.prepare(
    'SELECT id FROM downloads WHERE ip_hash = ?1 AND platform = ?2 AND ts >= ?3 LIMIT 1',
  )
    .bind(ipHash, platform, windowStart)
    .first<{ id: number }>();

  if (dup) return;

  await env.DB.prepare(
    'INSERT INTO downloads (ts, platform, version, ip_hash, ua) VALUES (?1, ?2, ?3, ?4, ?5)',
  )
    .bind(now, platform, version, ipHash, ua)
    .run();
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, params, request } = context as unknown as Ctx;
  const platform = String(params.platform).toLowerCase();

  if (!PLATFORMS.includes(platform as Platform)) {
    return json({ ok: false, error: 'unknown platform' }, 404);
  }
  const plat = platform as Platform;

  const repo = (env.RELEASE_REPO || '').trim();
  if (!repo) {
    return json({ ok: false, error: 'RELEASE_REPO not configured' }, 500);
  }

  // 查 latest release（follow redirect；未发布 latest 时 fallback 到 releases 列表第一条）
  const apiBase = (env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '');
  const ghHeaders = {
    'User-Agent': 'niuma-encourager-site',
    Accept: 'application/vnd.github+json',
  };
  let release: { tag_name?: string; assets?: { name: string; browser_download_url: string }[] } | null = null;
  let ghRes = await fetch(`${apiBase}/repos/${repo}/releases/latest`, {
    headers: ghHeaders,
    redirect: 'follow',
  });
  if (ghRes.ok) {
    release = await ghRes.json();
  } else if (ghRes.status === 404) {
    const listRes = await fetch(`${apiBase}/repos/${repo}/releases?per_page=5`, {
      headers: ghHeaders,
    });
    if (listRes.ok) {
      const list = (await listRes.json()) as typeof release[];
      release = (list && list[0]) || null;
    }
  }

  const assets = release?.assets || [];
  const asset = pickAsset(assets, plat);
  if (!asset) {
    return json({ ok: false, error: 'asset not found', repo, platform: plat }, 404);
  }

  // 计数（失败不阻断下载）
  try {
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const ua = request.headers.get('User-Agent') || '';
    if (ip && env.DB) {
      const ipHash = await sha256Hex(ip);
      const version = versionFromTag(release?.tag_name || '') === 'unknown'
        ? versionFromAssetName(asset.name)
        : versionFromTag(release?.tag_name || '');
      await countDownload(env, plat, ipHash, version, ua);
    }
  } catch {
    // 统计失败不影响下载
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: asset.url,
      'Cache-Control': 'no-store',
      'X-Asset-Name': asset.name,
    },
  });
};
