# 🐂🐎 牛马鼓励器

> 把月薪拆到每一秒，实时跳动地"赚"给你看。macOS / Windows 双端桌面应用 + 官网下载站。

![logo](assets/logo/logo-1024.png)

## 项目结构

```
app/    Tauri 2 桌面端（原生 TS 前端 + Rust 计薪核心 + SQLite）
site/   官网 niuma.linkpad.site（Cloudflare Pages + Functions + D1 下载统计）
assets/ 设计源文件（logo）
```

## 本地开发

### 桌面端

```bash
cd app
pnpm install
pnpm tauri dev      # 开发调试
pnpm tauri build    # 打包 dmg/msi/nsis
```

纯浏览器调试 UI（mock 模式）：

```bash
cd app && pnpm dev  # http://localhost:1420
```

### 官网 / 后台

```bash
cd site
npm install
npx wrangler pages dev .   # 本地预览（需本地 D1：npx wrangler d1 execute niuma-stats --local --file=schema.sql）
npx wrangler pages deploy  # 部署生产
```

## 发布流程

1. 推 tag：`git tag v0.1.0 && git push --tags` → GitHub Actions 自动构建 macOS (arm64+x64) / Windows 安装包并发布到 Release
2. 官网下载按钮经 `/api/dl/:platform` 计数后 302 到最新 Release 资产
3. `site/` 变更推 main → 自动部署 Cloudflare Pages + 应用 D1 schema

## 需要配置的 Secrets（仓库 Settings → Secrets → Actions）

| Secret | 用途 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Pages 部署（需 Pages: Edit + D1: Edit 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

Cloudflare Dashboard 侧：创建 D1 数据库 `niuma-stats`；Pages 项目环境变量 `ADMIN_TOKEN`（管理后台鉴权）、`RELEASE_REPO`（如 `yourname/niuma-encourager`）；绑定自定义域 `niuma.linkpad.site`。

## 隐私承诺

桌面端完全本地运行：无账号、无遥测、无网络请求，数据存本机 `Application Support`（macOS）/ `%APPDATA%`（Windows）。官网仅统计下载行为本身。

## 许可

仅供娱乐，不构成任何劳动报酬依据 🐂
