/**
 * 首次启动三步引导（方案 §3.1）
 */
import { invoke, defaultProfile, type Profile } from "./api";
import { icons } from "./icons";

export function isOnboardingNeeded(p: Profile): boolean {
  return !p.onboardingDone;
}

export function renderOnboarding(root: HTMLElement, existing: Profile, onDone: (p: Profile) => void) {
  const draft: Profile = { ...defaultProfile, ...existing };
  let step = 0;

  const targets = [
    { name: "一杯奶茶", price: 18 },
    { name: "一顿火锅", price: 128 },
    { name: "一件 T 恤", price: 79 },
    { name: "iPhone", price: 7999 },
    { name: "退出牛马生涯", price: 3000000 },
  ];

  root.innerHTML = `
    <div class="topbar"><div class="brand"><img class="logo-img" src="/logo.png" alt="牛马鼓励器">牛马鼓励器</div></div>
    <div class="steps"><i data-s="0"></i><i data-s="1"></i><i data-s="2"></i></div>
    <div class="view">
      <div class="sticker form-card" id="ob-card"></div>
    </div>
    <div class="footer-bar">
      <button class="btn btn--ghost" id="ob-back">上一步</button>
      <button class="btn btn--grow" id="ob-next">下一步</button>
    </div>
  `;

  const card = root.querySelector("#ob-card") as HTMLElement;
  const backBtn = root.querySelector("#ob-back") as HTMLButtonElement;
  const nextBtn = root.querySelector("#ob-next") as HTMLButtonElement;

  const render = () => {
    root.querySelectorAll(".steps i").forEach((el, i) => el.classList.toggle("on", i <= step));
    backBtn.style.display = step === 0 ? "none" : "";
    nextBtn.innerHTML = step === 2 ? `开始搬砖 ${icons.sparkle}` : "下一步";
    if (step === 0) renderStep1();
    else if (step === 1) renderStep2();
    else renderStep3();
  };

  const renderStep1 = () => {
    card.innerHTML = `
      <div class="form-title">你的牛马档案</div>
      <div class="form-sub">月薪按税后到手算，钱才会数得开心</div>
      <div class="field">
        <label>称呼（可选）</label>
        <input type="text" id="f-nick" placeholder="牛马" value="${draft.nickname === "牛马" ? "" : draft.nickname}">
      </div>
      <div class="field">
        <label>月薪（税后 ¥）*</label>
        <input type="number" id="f-salary" min="1000" max="10000000" step="100" value="${draft.monthlySalary || ""}">
        <span class="err" id="f-salary-err"></span>
      </div>
      <div class="field">
        <label>计薪方式</label>
        <select id="f-calc">
          <option value="21.75" selected>标准月 21.75 天</option>
        </select>
      </div>
      <div class="field-row">
        <button class="btn btn--ghost btn--full" id="f-default">使用默认值快速开始</button>
      </div>
    `;
    (card.querySelector("#f-default") as HTMLButtonElement).onclick = () => {
      finish({ ...defaultProfile, onboardingDone: true });
    };
  };

  const renderStep2 = () => {
    const wdLabels = ["一", "二", "三", "四", "五", "六", "日"];
    card.innerHTML = `
      <div class="form-title">你的作息</div>
      <div class="form-sub">按真实出勤配置，数字才准</div>
      <div class="field-row">
        <div class="field"><label>上班时间</label><input type="time" id="f-start" value="${draft.workStart}"></div>
        <div class="field"><label>下班时间</label><input type="time" id="f-end" value="${draft.workEnd}"></div>
      </div>
      <div class="field">
        <label>每周工作日</label>
        <div class="weekdays">${wdLabels
          .map((l, i) => `<div class="wd ${draft.workdays[i] ? "on" : ""}" data-i="${i}">${l}</div>`)
          .join("")}</div>
      </div>
      <div class="field switch-row">
        <div><label>午休计薪</label><div class="desc">关闭则扣除 12:00-13:30（原版默认口径）</div></div>
        <input type="checkbox" id="f-lunch" ${draft.lunchPaid ? "checked" : ""} style="width:22px;height:22px">
      </div>
      <div class="field switch-row">
        <div><label>加班 1.5 倍模式</label><div class="desc">休息日/下班后搬砖按 1.5x 计薪</div></div>
        <input type="checkbox" id="f-ot" ${draft.overtimeEnabled ? "checked" : ""} style="width:22px;height:22px">
      </div>
    `;
    card.querySelectorAll(".wd").forEach((el) => {
      (el as HTMLElement).onclick = () => {
        const i = Number((el as HTMLElement).dataset.i);
        draft.workdays[i] = !draft.workdays[i];
        el.classList.toggle("on", draft.workdays[i]);
      };
    });
  };

  const renderStep3 = () => {
    card.innerHTML = `
      <div class="form-title">小目标（可跳过）</div>
      <div class="form-sub">赚够就弹提示，搬砖更有奔头</div>
      <div class="chips" id="f-chips">
        ${targets
          .map(
            (t) =>
              `<div class="chip ${draft.targetName === t.name ? "on" : ""}" data-n="${t.name}" data-p="${t.price}">${t.name} ¥${t.price}</div>`
          )
          .join("")}
      </div>
      <div class="field-row">
        <div class="field"><label>自定义名称</label><input type="text" id="f-tn" placeholder="如：PS5" value="${draft.targetName ?? ""}"></div>
        <div class="field"><label>金额 ¥</label><input type="number" id="f-tp" min="1" value="${draft.targetPrice ?? ""}"></div>
      </div>
    `;
    card.querySelectorAll(".chip").forEach((el) => {
      (el as HTMLElement).onclick = () => {
        card.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
        el.classList.add("on");
        const n = (el as HTMLElement).dataset.n!;
        const p = Number((el as HTMLElement).dataset.p);
        (card.querySelector("#f-tn") as HTMLInputElement).value = n;
        (card.querySelector("#f-tp") as HTMLInputElement).value = String(p);
      };
    });
  };

  const collect = (): string | null => {
    if (step === 0) {
      const nick = (card.querySelector("#f-nick") as HTMLInputElement)?.value.trim();
      const salary = Number((card.querySelector("#f-salary") as HTMLInputElement)?.value);
      const err = card.querySelector("#f-salary-err") as HTMLElement;
      if (!salary || salary < 1000 || salary > 10000000) {
        if (err) err.textContent = "月薪需在 ¥1,000 ~ ¥10,000,000 之间";
        return "salary";
      }
      draft.nickname = nick || "牛马";
      draft.monthlySalary = salary;
    } else if (step === 1) {
      draft.workStart = (card.querySelector("#f-start") as HTMLInputElement).value || "09:00";
      draft.workEnd = (card.querySelector("#f-end") as HTMLInputElement).value || "18:00";
      draft.lunchPaid = (card.querySelector("#f-lunch") as HTMLInputElement).checked;
      draft.overtimeEnabled = (card.querySelector("#f-ot") as HTMLInputElement).checked;
      if (!draft.workdays.some(Boolean)) {
        draft.workdays = [true, true, true, true, true, false, false];
      }
    } else {
      const tn = (card.querySelector("#f-tn") as HTMLInputElement)?.value.trim();
      const tp = Number((card.querySelector("#f-tp") as HTMLInputElement)?.value);
      draft.targetName = tn || null;
      draft.targetPrice = tn && tp > 0 ? tp : null;
    }
    return null;
  };

  const finish = async (p: Profile) => {
    await invoke("save_profile", { profile: p });
    onDone(p);
  };

  nextBtn.onclick = async () => {
    if (collect()) return;
    if (step < 2) {
      step++;
      render();
    } else {
      await finish({ ...draft, onboardingDone: true });
    }
  };
  backBtn.onclick = () => {
    if (step > 0) {
      step--;
      render();
    }
  };

  render();
}
