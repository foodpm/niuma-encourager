/**
 * 主界面：对齐原版截图 + 牛马梗文案（方案 §3.2 / §12.5）
 */
import { invoke, onTick, type Profile, type Tick } from "./api";
import { MoneyAnimator, formatCountdown, hoursLabel } from "./money";
import { icons } from "./icons";

const SKIN = {
  meme: {
    working: "圈养中",
    break: "摸鱼中",
    off: "已出栏",
    restday: "今天不上班",
    countdownPrefix: "距离出栏还有",
    pauseBtn: "摸鱼一会儿（暂停计薪）",
    resumeBtn: "继续搬砖",
    unit: "草料",
  },
  formal: {
    working: "上班中",
    break: "休息中",
    off: "已下班",
    restday: "休息日",
    countdownPrefix: "距离下班还有",
    pauseBtn: "休息一下（暂停计时）",
    resumeBtn: "继续计时",
    unit: "工资",
  },
} as const;

export function renderDashboard(root: HTMLElement, profile: Profile, goSettings: () => void) {
  root.innerHTML = `
    <div class="topbar">
      <div class="brand"><img class="logo-img" src="/logo.png" alt=""><span id="brand-name">牛马鼓励器</span></div>
      <button class="icon-btn" id="btn-settings" title="设置">${icons.gear}</button>
    </div>
    <div class="view">
      <div class="dateline num" id="dateline">--</div>
      <div class="status-hero">
        <div class="big" id="status-big">--</div>
        <div class="countdown" id="countdown"></div>
      </div>
      <div class="sticker earn-card">
        <div class="label">今日已赚（${SKIN[profile.skin].unit}）</div>
        <div class="earn-amount">
          <span class="cny">¥</span>
          <span class="value num" id="earn-value">0.0000</span>
        </div>
        <div class="rate-line num">当前赚钱速度 ¥<span id="rate">0.0000</span> / 秒</div>
        <div class="target-line" id="target-line" style="display:none"></div>
      </div>
      <button class="btn btn--dark btn--full" id="btn-pause">${icons.pause} ${SKIN[profile.skin].pauseBtn}</button>
      <div class="sticker progress-card">
        <div class="progress-head">
          <span>今日工时进度 <b class="num" id="progress-pct">0.0%</b></span>
          <span class="num" id="worked-hours"></span>
        </div>
        <div class="progress-track"><div class="progress-fill" id="progress-fill" style="width:0%"></div></div>
      </div>
      <div class="sticker month-card">
        <div class="month-row">
          <span class="label">本月累计</span>
          <span class="amount" id="month-total">¥0.00</span>
        </div>
        <div class="month-note">已过的日子按满勤补算。本月只计已赚，不含亏损。</div>
      </div>
      <div class="foot-info">
        <span>时薪 ¥<span class="num" id="hour-rate">0.00</span></span>
        <span>今日满勤可得 ¥<span class="num" id="full-day">0.00</span></span>
      </div>
      <div class="foot-info" style="justify-content:center">
        <span style="opacity:.6">仅供娱乐，不构成任何劳动报酬依据 <img class="logo-img logo-img--sm" src="/logo.png" alt=""></span>
      </div>
    </div>
  `;

  const earnEl = root.querySelector("#earn-value") as HTMLElement;
  const animator = new MoneyAnimator(earnEl);
  (root.querySelector("#hour-rate") as HTMLElement).textContent = (profile.monthlySalary / (21.75 * 8)).toFixed(2);
  (root.querySelector("#brand-name") as HTMLElement).textContent = profile.nickname === "牛马" ? "牛马鼓励器" : `${profile.nickname}鼓励器`;

  let lastStatus = "";

  const pauseBtn = root.querySelector("#btn-pause") as HTMLButtonElement;
  pauseBtn.onclick = async () => {
    const s = await invoke<string>("pause_resume");
    lastStatus = s === "break" ? "break" : "working";
    updatePauseBtn(lastStatus);
  };

  const updatePauseBtn = (status: string) => {
    const skin = SKIN[profile.skin];
    if (status === "break") {
      pauseBtn.innerHTML = `${icons.play} ${skin.resumeBtn}`;
      pauseBtn.classList.remove("btn--dark");
      pauseBtn.classList.add("btn--red");
    } else {
      pauseBtn.innerHTML = `${icons.pause} ${skin.pauseBtn}`;
      pauseBtn.classList.add("btn--dark");
      pauseBtn.classList.remove("btn--red");
    }
  };

  (root.querySelector("#btn-settings") as HTMLElement).onclick = goSettings;

  const weekCN = ["日", "一", "二", "三", "四", "五", "六"];

  const renderTick = (t: Tick) => {
    // 日期秒表
    const d = new Date(t.now);
    const pad = (n: number) => String(n).padStart(2, "0");
    (root.querySelector("#dateline") as HTMLElement).textContent =
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 周${weekCN[d.getDay()]} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    // 状态大字
    const skin = SKIN[profile.skin];
    const big = root.querySelector("#status-big") as HTMLElement;
    if (t.status !== lastStatus) {
      big.textContent = skin[t.status];
      big.classList.toggle("is-break", t.status === "break");
      big.classList.toggle("is-off", t.status === "off");
      updatePauseBtn(t.status);
      lastStatus = t.status;
    }

    // 倒计时
    const cd = root.querySelector("#countdown") as HTMLElement;
    if (t.status === "working") {
      cd.textContent = `${skin.countdownPrefix} ${formatCountdown(t.countdownSec)}`;
    } else if (t.status === "break") {
      cd.innerHTML = `${icons.coin} 暂停期间不计薪，回来继续`;
    } else if (t.status === "off") {
      cd.innerHTML = `${icons.moon} 今天辛苦了，明天再战`;
    } else {
      cd.textContent = "好好休息，钱包在周末也睡着";
    }

    // 金额
    animator.setActive(t.status === "working");
    animator.setTarget(t.earnedToday);
    (root.querySelector("#rate") as HTMLElement).textContent = t.ratePerSec.toFixed(4);

    // 小目标
    const tl = root.querySelector("#target-line") as HTMLElement;
    if (t.targetName && t.targetEtaSec != null) {
      tl.style.display = "";
      tl.innerHTML =
        t.targetEtaSec === 0
          ? `${icons.sparkle} ${t.targetName}已经赚回来了！`
          : `再过 ${formatCountdown(t.targetEtaSec)}，${t.targetName}就赚回来了。`;
    } else {
      tl.style.display = "none";
    }

    // 进度
    const pct = t.plannedSec > 0 ? (t.workedSec / t.plannedSec) * 100 : 0;
    (root.querySelector("#progress-pct") as HTMLElement).textContent = `${pct.toFixed(1)}%`;
    (root.querySelector("#progress-fill") as HTMLElement).style.width = `${Math.min(100, pct)}%`;
    (root.querySelector("#worked-hours") as HTMLElement).textContent = hoursLabel(t.workedSec, t.plannedSec);

    // 月累计 + 满勤
    (root.querySelector("#month-total") as HTMLElement).textContent = `¥${t.monthTotal.toFixed(2)}`;
    (root.querySelector("#full-day") as HTMLElement).textContent = t.fullDayEarn.toFixed(2);
  };

  let unsub: (() => void) | null = null;
  onTick(renderTick).then((u) => (unsub = u));

  // 组件销毁钩子（简单起见挂在 root 上）
  (root as any).__destroy = () => {
    unsub?.();
    animator.destroy();
  };
}
