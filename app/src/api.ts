/**
 * Tauri 桥接层 + 浏览器 mock。
 * 有 Tauri 环境 → invoke/listen 真数据；无 → mock 模式（可纯浏览器演示）。
 */
export type Status = "working" | "break" | "off" | "restday";

export interface Tick {
  now: string;
  status: Status;
  earnedToday: number;
  ratePerSec: number;
  countdownSec: number;
  workedSec: number;
  plannedSec: number;
  monthTotal: number;
  fullDayEarn: number;
  targetName: string | null;
  targetEtaSec: number | null;
}

export interface Profile {
  nickname: string;
  monthlySalary: number;
  workStart: string;
  workEnd: string;
  workdays: boolean[]; // 周一..周日
  lunchPaid: boolean;
  overtimeEnabled: boolean;
  targetName: string | null;
  targetPrice: number | null;
  skin: "meme" | "formal";
  theme: "auto" | "light" | "dark";
  onboardingDone: boolean;
}

export const defaultProfile: Profile = {
  nickname: "牛马",
  monthlySalary: 3000,
  workStart: "09:00",
  workEnd: "18:00",
  workdays: [true, true, true, true, true, false, false],
  lunchPaid: false,
  overtimeEnabled: true,
  targetName: "一杯奶茶",
  targetPrice: 18,
  skin: "meme",
  theme: "auto",
  onboardingDone: false,
};

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  return mockInvoke<T>(cmd, args);
}

async function onTick(cb: (t: Tick) => void): Promise<() => void> {
  if (isTauri) {
    const { listen } = await import("@tauri-apps/api/event");
    const un = await listen<Tick>("tick", (e) => cb(e.payload));
    return () => un();
  }
  return mockOnTick(cb);
}

// ---------- mock 实现 ----------

let mockProfile: Profile = { ...defaultProfile, onboardingDone: false };
let mockPaused = false;
let mockEarned = 0;
let mockLastTs = Date.now();
const mockListeners = new Set<(t: Tick) => void>();

function mockRatePerSec(): number {
  return mockProfile.monthlySalary / (21.75 * 8) / 3600;
}

function mockStatus(): Status {
  if (mockPaused) return "break";
  const now = new Date();
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
  if (!mockProfile.workdays[day]) return "restday";
  const mins = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = mockProfile.workStart.split(":").map(Number);
  const [eh, em] = mockProfile.workEnd.split(":").map(Number);
  if (mins < sh * 60 + sm || mins >= eh * 60 + em) return "off";
  return "working";
}

function mockLoop() {
  setInterval(() => {
    const now = Date.now();
    const dt = (now - mockLastTs) / 1000;
    mockLastTs = now;
    if (mockStatus() === "working") mockEarned += dt * mockRatePerSec();
    const t = buildMockTick();
    mockListeners.forEach((cb) => cb(t));
  }, 100);
}

function buildMockTick(): Tick {
  const now = new Date();
  const [sh, sm] = mockProfile.workStart.split(":").map(Number);
  const [eh, em] = mockProfile.workEnd.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const planned = ((eh - sh) * 60 + (em - sm) - (mockProfile.lunchPaid ? 0 : 90)) * 60;
  const rate = mockRatePerSec();
  const etaTarget =
    mockProfile.targetPrice && mockProfile.targetPrice > 0
      ? Math.max(0, Math.ceil((mockProfile.targetPrice - mockEarned) / rate))
      : null;
  return {
    now: now.toISOString(),
    status: mockStatus(),
    earnedToday: mockEarned,
    ratePerSec: rate,
    countdownSec: Math.max(0, (eh * 60 + em - mins) * 60 - now.getSeconds()),
    workedSec: Math.round(mockEarned / rate),
    plannedSec: planned,
    monthTotal: mockEarned * 12, // mock：随便给个有感数字
    fullDayEarn: planned * rate,
    targetName: mockProfile.targetName,
    targetEtaSec: etaTarget,
  };
}

function mockInvoke<T>(cmd: string, _args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "get_state":
      return Promise.resolve({
        profile: mockProfile,
        earned_today: mockEarned,
        paused: mockPaused,
        today: new Date().toISOString().slice(0, 10),
      } as T);
    case "save_profile":
      mockProfile = { ...mockProfile, ...(_args?.profile as Profile) };
      return Promise.resolve(undefined as T);
    case "pause_resume":
      mockPaused = !mockPaused;
      return Promise.resolve(mockPaused ? "break" : "working") as Promise<T>;
    case "export_csv":
      return Promise.reject(new Error("浏览器演示模式不支持导出"));
    case "open_data_dir":
      return Promise.reject(new Error("浏览器演示模式不支持"));
    default:
      return Promise.reject(new Error(`mock 未实现命令: ${cmd}`));
  }
}

function mockOnTick(cb: (t: Tick) => void): () => void {
  mockListeners.add(cb);
  if (mockListeners.size === 1) mockLoop();
  return () => mockListeners.delete(cb);
}

export { invoke, onTick, isTauri };
