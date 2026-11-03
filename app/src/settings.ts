/**
 * 设置页（方案 §3.4）
 */
import { invoke, type Profile } from "./api";
import { icons } from "./icons";

export function renderSettings(root: HTMLElement, profile: Profile, onBack: (p: Profile) => void) {
  const draft: Profile = { ...profile };

  root.innerHTML = `
    <div class="topbar">
      <button class="icon-btn" id="s-back" title="返回">${icons.back}</button>
      <div class="brand">${icons.gear} 设置</div>
      <button class="btn btn--red" id="s-save" style="padding:7px 14px; font-size:13px">保存</button>
    </div>
    <div class="view settings-list">
      <div class="sticker settings-section">
        <h3>${icons.user} 牛马档案</h3>
        <div class="field"><label>称呼</label><input type="text" id="s-nick" value="${draft.nickname}"></div>
        <div class="field" style="margin-top:10px"><label>月薪（税后 ¥）</label><input type="number" id="s-salary" value="${draft.monthlySalary}"></div>
      </div>
      <div class="sticker settings-section">
        <h3>${icons.clock} 作息</h3>
        <div class="field-row">
          <div class="field"><label>上班</label><input type="time" id="s-start" value="${draft.workStart}"></div>
          <div class="field"><label>下班</label><input type="time" id="s-end" value="${draft.workEnd}"></div>
        </div>
        <div class="field switch-row" style="margin-top:10px">
          <div><label>午休计薪</label></div>
          <input type="checkbox" id="s-lunch" ${draft.lunchPaid ? "checked" : ""} style="width:22px;height:22px">
        </div>
      </div>
      <div class="sticker settings-section">
        <h3>${icons.target} 小目标</h3>
        <div class="field-row">
          <div class="field"><label>名称</label><input type="text" id="s-tn" value="${draft.targetName ?? ""}"></div>
          <div class="field"><label>金额 ¥</label><input type="number" id="s-tp" min="1" value="${draft.targetPrice ?? ""}"></div>
        </div>
      </div>
      <div class="sticker settings-section">
        <h3>${icons.palette} 外观</h3>
        <div class="field"><label>文案皮肤</label>
          <select id="s-skin">
            <option value="meme" ${draft.skin === "meme" ? "selected" : ""}>牛马梗版（圈养中/出栏）</option>
            <option value="formal" ${draft.skin === "formal" ? "selected" : ""}>正经版（上班中/下班）</option>
          </select>
        </div>
        <div class="field" style="margin-top:10px"><label>主题</label>
          <select id="s-theme">
            <option value="auto" ${draft.theme === "auto" ? "selected" : ""}>跟随系统</option>
            <option value="light" ${draft.theme === "light" ? "selected" : ""}>浅色</option>
            <option value="dark" ${draft.theme === "dark" ? "selected" : ""}>深色</option>
          </select>
        </div>
      </div>
      <div class="sticker settings-section">
        <h3>${icons.db} 数据</h3>
        <div class="field-row">
          <button class="btn btn--ghost" id="s-export" style="flex:1">${icons.export} 导出 CSV</button>
          <button class="btn btn--ghost" id="s-opendir" style="flex:1">${icons.folder} 打开数据目录</button>
        </div>
        <div class="about-note" style="margin-top:10px">
          完全本地存储：无账号、无遥测、无网络请求。<br>
          数据位于应用数据目录（profile.json + niuma.db）。
        </div>
      </div>
      <div class="sticker settings-section about-note">
        <b>牛马鼓励器 v0.1.0</b><br>
        把月薪拆到每一秒，实时跳动地"赚"给你看。<br>
        仅供娱乐，不构成任何劳动报酬依据。
      </div>
    </div>
  `;

  (root.querySelector("#s-back") as HTMLElement).onclick = () => onBack(draft);

  (root.querySelector("#s-save") as HTMLElement).onclick = async () => {
    draft.nickname = (root.querySelector("#s-nick") as HTMLInputElement).value.trim() || "牛马";
    draft.monthlySalary = Number((root.querySelector("#s-salary") as HTMLInputElement).value) || draft.monthlySalary;
    draft.workStart = (root.querySelector("#s-start") as HTMLInputElement).value || "09:00";
    draft.workEnd = (root.querySelector("#s-end") as HTMLInputElement).value || "18:00";
    draft.lunchPaid = (root.querySelector("#s-lunch") as HTMLInputElement).checked;
    draft.targetName = (root.querySelector("#s-tn") as HTMLInputElement).value.trim() || null;
    const tp = Number((root.querySelector("#s-tp") as HTMLInputElement).value);
    draft.targetPrice = draft.targetName && tp > 0 ? tp : null;
    draft.skin = (root.querySelector("#s-skin") as HTMLSelectElement).value as Profile["skin"];
    draft.theme = (root.querySelector("#s-theme") as HTMLSelectElement).value as Profile["theme"];
    await invoke("save_profile", { profile: draft });
    onBack(draft);
  };

  (root.querySelector("#s-export") as HTMLElement).onclick = async () => {
    try {
      await invoke<string>("export_csv");
      alert("已导出到应用数据目录");
    } catch (e) {
      alert(String(e));
    }
  };
  (root.querySelector("#s-opendir") as HTMLElement).onclick = () => {
    invoke("open_data_dir").catch((e) => alert(String(e)));
  };
}
