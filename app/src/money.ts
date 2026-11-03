/**
 * 跳动数字引擎：rAF + lerp 追值 + 最低位毛刺 + 整元弹跳。
 */
export class MoneyAnimator {
  private display = 0; // 当前展示值
  private target = 0; // 真实值
  private raf = 0;
  private lastWhole = 0;
  private el: HTMLElement;
  private running = false;
  private active = false; // 是否在计薪（决定毛刺抖动）

  constructor(el: HTMLElement) {
    this.el = el;
  }

  setTarget(v: number) {
    this.target = v;
    this.start();
  }

  /** 计薪状态：仅 working 时为 true，毛刺只在赚钱时出现 */
  setActive(v: boolean) {
    this.active = v;
  }

  /** 立即追平（用于设置变更等场景） */
  snap() {
    this.display = this.target;
    this.render();
  }

  private start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      const diff = this.target - this.display;
      if (Math.abs(diff) < 0.00005) {
        this.display = this.target;
      } else {
        this.display += diff * 0.15;
      }
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.running = false;
  }

  private render() {
    const v = this.display;
    const whole = Math.floor(v);
    // 最低位毛刺：仅计薪时在 ±3 范围抖动；暂停/下班/休息日 → 数字完全静止
    const jitter = this.active ? (Math.random() * 6 - 3) : 0;
    const shown = Math.max(0, v + jitter * 0.0001);
    const text = shown.toFixed(4);
    if (this.el.textContent !== text) this.el.textContent = text;
    // 整元弹跳
    if (whole !== this.lastWhole) {
      if (whole > this.lastWhole && this.lastWhole >= 0) {
        this.el.classList.remove("bump");
        void this.el.offsetWidth; // reflow 重启动画
        this.el.classList.add("bump");
      }
      this.lastWhole = whole;
    }
  }
}

/** 倒计时格式化：X小时Y分Z秒；超长时长自动降级为天/年 */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  if (h >= 24 * 365) {
    const years = Math.floor(h / (24 * 365));
    const days = Math.floor((h % (24 * 365)) / 24);
    return `约 ${years} 年零 ${days} 天`;
  }
  if (h >= 24 * 30) {
    const days = Math.floor(h / 24);
    return `约 ${days} 天`;
  }
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}小时${m}分${sec}秒`;
  if (m > 0) return `${m}分${sec}秒`;
  return `${sec}秒`;
}

/** 秒数 → "X.XX / Y.YY 小时" */
export function hoursLabel(sec: number, plannedSec: number): string {
  return `${(sec / 3600).toFixed(2)} / ${(plannedSec / 3600).toFixed(2)} 小时`;
}

/** ETA 秒 → "X小时Y分" / "Y分Z秒" */
export function etaLabel(sec: number | null): string {
  if (sec == null) return "";
  return formatCountdown(sec);
}
