//! 计薪核心：纯函数，不依赖 tauri，便于单测。
//! 口径（方案 §4）：
//! - 秒薪 rate = 月薪 / (21.75 × 每日应工作秒数)
//! - 每日应工作秒数 = workEnd - workStart（午休计薪不扣；lunchPaid=false 扣 12:00-13:30）
//! - 今日已赚 = 有效工作秒数 × rate（有效 = 工作时段内 − 暂停）
//! - 月累计 = 当月已过工作日按满勤补算 + 今日实时已赚（只计已赚，不扣缺勤）
//! - 跨零点：02:00 前仍算前一天

use chrono::{DateTime, Datelike, Duration, NaiveDate, Timelike};

/// 用户档案（与前端契约，camelCase 序列化）
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Profile {
    pub nickname: String,
    pub monthly_salary: f64,
    /// "09:00"
    pub work_start: String,
    /// "18:00"
    pub work_end: String,
    /// 周一..周日，1=工作
    pub workdays: [bool; 7],
    pub lunch_paid: bool,
    pub overtime_enabled: bool,
    pub target_name: Option<String>,
    pub target_price: Option<f64>,
    /// "meme" | "formal"
    pub skin: String,
    /// "auto" | "light" | "dark"
    pub theme: String,
    pub onboarding_done: bool,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            nickname: "牛马".into(),
            monthly_salary: 3000.0,
            work_start: "09:00".into(),
            work_end: "18:00".into(),
            workdays: [true, true, true, true, true, false, false],
            lunch_paid: true,
            overtime_enabled: true,
            target_name: Some("一杯奶茶".into()),
            target_price: Some(18.0),
            skin: "meme".into(),
            theme: "auto".into(),
            onboarding_done: false,
        }
    }
}

/// 运行状态
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    /// 圈养中
    Working,
    /// 摸鱼中（暂停，不计薪）
    Break,
    /// 已出栏
    Off,
    /// 今天不上班
    Restday,
}

fn parse_hhmm(s: &str) -> Option<(u32, u32)> {
    let (h, m) = s.split_once(':')?;
    Some((h.trim().parse().ok()?, m.trim().parse().ok()?))
}

pub fn work_seconds_per_day(profile: &Profile) -> i64 {
    let Some((sh, sm)) = parse_hhmm(&profile.work_start) else { return 0 };
    let Some((eh, em)) = parse_hhmm(&profile.work_end) else { return 0 };
    let start = sh * 3600 + sm * 60;
    let end = eh * 3600 + em * 60;
    let mut total = (end - start).max(0) as i64;
    if !profile.lunch_paid {
        // 扣除与工作时段重叠的午休（12:00-13:30）
        let lunch_s = 12 * 3600;
        let lunch_e = 13 * 3600 + 30 * 60;
        let overlap = (end.min(lunch_e) - start.max(lunch_s)).max(0) as i64;
        total -= overlap;
    }
    total.max(0)
}

/// 时薪：法定月计薪时数 21.75 × 8h = 174h（与原版一致：月薪3000 → 时薪 ¥17.24）
pub fn rate_per_hour(profile: &Profile) -> f64 {
    profile.monthly_salary / (21.75 * 8.0)
}

/// 秒薪
pub fn rate_per_sec(profile: &Profile) -> f64 {
    rate_per_hour(profile) / 3600.0
}

/// 某日是否工作日（chrono: Mon=0 .. Sun=6）
pub fn is_workday(profile: &Profile, date: NaiveDate) -> bool {
    profile.workdays[date.weekday().num_days_from_monday() as usize]
}

/// 今日某时刻处于哪个时段（秒数，自当日 00:00 起）
enum Span {
    Before,
    Working,
    Lunch,
    After,
}

fn span_at(profile: &Profile, secs_of_day: i64) -> Span {
    let (sh, sm) = parse_hhmm(&profile.work_start).unwrap_or((9, 0));
    let (eh, em) = parse_hhmm(&profile.work_end).unwrap_or((18, 0));
    let s = (sh * 3600 + sm * 60) as i64;
    let e = (eh * 3600 + em * 60) as i64;
    if secs_of_day < s {
        Span::Before
    } else if secs_of_day >= e {
        Span::After
    } else if !profile.lunch_paid && secs_of_day >= 12 * 3600 && secs_of_day < 13 * 3600 + 30 * 60 {
        Span::Lunch
    } else {
        Span::Working
    }
}

/// 截至今日 now，今日已累计的有效工作秒数。
/// 暂停区间由调用方扣除（本函数算"应计薪的自然流逝"）。
pub fn worked_seconds_now(profile: &Profile, now: DateTime<chrono::Local>) -> i64 {
    if !is_workday(profile, now.date_naive()) {
        return 0;
    }
    let sod = (now.hour() * 3600 + now.minute() * 60 + now.second()) as i64;
    match span_at(profile, sod) {
        Span::Before => 0,
        Span::Lunch => {
            // 午休中（不计薪）：有效秒数 = work_start → 12:00
            let (sh, sm) = parse_hhmm(&profile.work_start).unwrap_or((9, 0));
            let s = (sh * 3600 + sm * 60) as i64;
            (12 * 3600 - s).max(0)
        }
        Span::Working | Span::After => {
            let (sh, sm) = parse_hhmm(&profile.work_start).unwrap_or((9, 0));
            let (eh, em) = parse_hhmm(&profile.work_end).unwrap_or((18, 0));
            let s = (sh * 3600 + sm * 60) as i64;
            let e = (eh * 3600 + em * 60) as i64;
            let mut secs = (sod.min(e) - s).max(0);
            if !profile.lunch_paid {
                let lunch_s = 12 * 3600;
                let lunch_e = 13 * 3600 + 30 * 60;
                secs -= (sod.min(e).min(lunch_e) - s.max(lunch_s)).max(0);
                secs = secs.max(0);
            }
            secs
        }
    }
}

/// 今日满勤可得
pub fn full_day_earn(profile: &Profile) -> f64 {
    work_seconds_per_day(profile) as f64 * rate_per_sec(profile)
}

/// 距下班秒数（working 时段内），否则 0
pub fn countdown_to_off(profile: &Profile, now: DateTime<chrono::Local>) -> i64 {
    let (eh, em) = parse_hhmm(&profile.work_end).unwrap_or((18, 0));
    let e = (eh * 3600 + em * 60) as i64;
    let sod = (now.hour() * 3600 + now.minute() * 60 + now.second()) as i64;
    (e - sod).max(0)
}

pub fn current_status(profile: &Profile, now: DateTime<chrono::Local>, paused: bool) -> Status {
    if paused {
        return Status::Break;
    }
    if !is_workday(profile, now.date_naive()) {
        return Status::Restday;
    }
    let sod = (now.hour() * 3600 + now.minute() * 60 + now.second()) as i64;
    match span_at(profile, sod) {
        Span::Working => Status::Working,
        Span::Lunch => Status::Working, // 午休计薪=持续工作；不计薪时也算在岗（冻结见 span 处理）
        _ => Status::Off,
    }
}

/// 月累计：当月 1 日至昨日，已过工作日按满勤补算；加今日实时已赚。
/// today_earned 由调用方传入（含暂停扣除后的真实值）。
pub fn month_total(profile: &Profile, today: NaiveDate, today_earned: f64) -> f64 {
    let first = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap();
    let mut passed_full_days = 0i64;
    let mut d = first;
    while d < today {
        if is_workday(profile, d) {
            passed_full_days += 1;
        }
        d += Duration::days(1);
    }
    passed_full_days as f64 * full_day_earn(profile) + today_earned.max(0.0)
}

/// 小目标 ETA 秒数
pub fn target_eta_sec(profile: &Profile, today_earned: f64) -> Option<i64> {
    let price = profile.target_price?;
    if price <= 0.0 {
        return None;
    }
    let remain = price - today_earned;
    if remain <= 0.0 {
        return Some(0);
    }
    let r = rate_per_sec(profile);
    if r <= 0.0 {
        return None;
    }
    Some((remain / r).ceil() as i64)
}

// ---------- 测试 ----------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn profile() -> Profile {
        Profile {
            monthly_salary: 3000.0,
            work_start: "09:00".into(),
            work_end: "18:00".into(),
            lunch_paid: false, // 原版口径：午休 1.5h 不计薪 → 日工时 7.5h
            ..Profile::default()
        }
    }

    fn at(y: i32, mo: u32, d: u32, h: u32, mi: u32, s: u32) -> DateTime<chrono::Local> {
        chrono::Local
            .with_ymd_and_hms(y, mo, d, h, mi, s)
            .single()
            .unwrap()
    }

    #[test]
    fn test_rate_and_full_day_match_original() {
        let p = profile(); // 09:00-18:00 午休不计薪 = 7.5h
        assert_eq!(work_seconds_per_day(&p), 7 * 3600 + 1800);
        // 原版口径：时薪 = 3000/(21.75×8) = ¥17.24，秒薪 ≈ 0.0048
        assert!((rate_per_hour(&p) - 17.24).abs() < 0.01);
        assert!((rate_per_sec(&p) - 0.0048).abs() < 0.0001);
        // 满勤 = 7.5h × 秒薪 = ¥129.30（原版口径：日工时 × 秒薪）
        assert!((full_day_earn(&p) - 129.30).abs() < 0.02);
    }

    #[test]
    fn test_lunch_unpaid_deducts_overlap() {
        let mut p = profile(); // 09:00-18:00 = 9h
        p.lunch_paid = false;
        // 9h - 1.5h 午休重叠 = 7.5h
        assert_eq!(work_seconds_per_day(&p), 7 * 3600 + 1800);
    }

    #[test]
    fn test_worked_seconds_progression() {
        let p = profile(); // 09:00-18:00 午休不计薪
        // 9:00 整 → 0
        assert_eq!(worked_seconds_now(&p, at(2026, 11, 2, 9, 0, 0)), 0);
        // 11:00 → 2h
        assert_eq!(worked_seconds_now(&p, at(2026, 11, 2, 11, 0, 0)), 7200);
        // 12:30（午休中）→ 3h（09:00-12:00）
        assert_eq!(worked_seconds_now(&p, at(2026, 11, 2, 12, 30, 0)), 3 * 3600);
        // 20:00 下班后 → 全天 7.5h
        assert_eq!(worked_seconds_now(&p, at(2026, 11, 2, 20, 0, 0)), 7 * 3600 + 1800);
        // 周日 → 0
        assert_eq!(worked_seconds_now(&p, at(2026, 11, 1, 12, 0, 0)), 0);
    }

    #[test]
    fn test_pause_deduction_and_earned() {
        let p = profile();
        let rate = rate_per_sec(&p); // ≈0.00479
        // 15:05:36（原版截图时刻）：自然 = 6h5m36s − 1.5h 午休 = 4h35m36s = 16536s
        let natural = worked_seconds_now(&p, at(2026, 11, 2, 15, 5, 36)) as f64;
        assert_eq!(natural as i64, 4 * 3600 + 35 * 60 + 36);
        let earned = natural * rate;
        // 原版截图 ¥79.1893 校验
        assert!((earned - 79.1893).abs() < 0.5, "earned={earned}");
        // 摸鱼 10 分钟再验证
        let earned2 = (natural - 600.0) * rate;
        assert!(earned2 < earned);
    }

    #[test]
    fn test_month_total_backfill() {
        let p = profile();
        // 2026-11-03（周二）：11-02 周一已过 → 1 个满勤日 + 今日实时
        let total = month_total(&p, NaiveDate::from_ymd_opt(2026, 11, 3).unwrap(), 79.1893);
        let expect = full_day_earn(&p) + 79.1893;
        assert!((total - expect).abs() < 1e-6);
        // 月初 1 号当天：只有实时（11-02 作为"今天"时无已过日）
        let t1 = month_total(&p, NaiveDate::from_ymd_opt(2026, 11, 1).unwrap(), 10.0);
        assert!((t1 - 10.0).abs() < 1e-6);
    }

    #[test]
    fn test_status_transitions() {
        let p = profile();
        assert_eq!(current_status(&p, at(2026, 11, 2, 10, 0, 0), false), Status::Working);
        assert_eq!(current_status(&p, at(2026, 11, 2, 10, 0, 0), true), Status::Break);
        assert_eq!(current_status(&p, at(2026, 11, 2, 19, 0, 0), false), Status::Off);
        assert_eq!(current_status(&p, at(2026, 11, 1, 10, 0, 0), false), Status::Restday);
    }

    #[test]
    fn test_countdown() {
        let p = profile();
        // 原版截图：15:05:36 → 距 18:00 还有 2h54m24s
        assert_eq!(countdown_to_off(&p, at(2026, 11, 2, 15, 5, 36)), 2 * 3600 + 54 * 60 + 24);
    }

    #[test]
    fn test_target_eta() {
        let mut p = profile();
        p.target_price = Some(18.0);
        // rate ≈ 0.0048/s → 18/0.0048 ≈ 3750s
        let eta = target_eta_sec(&p, 0.0).unwrap();
        assert!((eta as f64 - 18.0 / rate_per_sec(&p)).abs() < 1.0);
        // 已赚超过目标
        assert_eq!(target_eta_sec(&p, 20.0), Some(0));
    }
}
