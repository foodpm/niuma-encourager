/**
 * 入口：视图路由（onboarding / dashboard / settings）
 */
import "./styles.css";
import { invoke, isTauri, defaultProfile, type Profile } from "./api";
import { renderOnboarding, isOnboardingNeeded } from "./onboarding";
import { renderDashboard } from "./dashboard";
import { renderSettings } from "./settings";

const app = document.getElementById("app")!;

async function boot() {
  let profile: Profile = defaultProfile;
  try {
    const state = await invoke<{ profile: Profile }>("get_state");
    profile = { ...defaultProfile, ...state.profile };
  } catch {
    // mock/异常时用默认
  }
  applyTheme(profile.theme);
  route(profile);
}

function applyTheme(theme: Profile["theme"]) {
  if (theme === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
}

function route(profile: Profile) {
  applyTheme(profile.theme);
  if (isOnboardingNeeded(profile)) {
    renderOnboarding(app, profile, (p) => {
      profile = p;
      route(profile);
    });
  } else {
    renderDashboard(app, profile, () => {
      renderSettings(app, profile, (updated) => {
        profile = updated;
        route(profile); // 回主界面并按新 profile 重渲染
      });
    });
  }
}

boot();

// 提示开发模式
if (!isTauri) {
  console.info("[牛马鼓励器] 浏览器 mock 模式：数据为模拟，仅演示 UI 交互");
}
