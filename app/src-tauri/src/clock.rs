//! 全局时钟：100ms tick，按真实时间差累计（防休眠/挂起漏算）。
//! emit "tick" 事件给前端。

use crate::payroll::{self, Profile, Status};
use crate::store::{date_of_local, Store};
use chrono::Local;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

pub struct ClockState {
    pub paused: AtomicBool,
    /// 暂停累计秒数（当日）
    pub paused_secs: Mutex<f64>,
    /// 今日已赚（含暂停扣除），持久化前的权威值
    pub earned_today: Mutex<f64>,
    /// 上次 tick 时刻
    pub last_tick: Mutex<Option<Instant>>,
    /// 上次落库时刻
    pub last_flush: Mutex<Option<Instant>>,
    /// 当前归属日
    pub current_date: Mutex<Option<chrono::NaiveDate>>,
}

impl ClockState {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            paused_secs: Mutex::new(0.0),
            earned_today: Mutex::new(0.0),
            last_tick: Mutex::new(None),
            last_flush: Mutex::new(None),
            current_date: Mutex::new(None),
        }
    }

    pub fn reset_day(&self) {
        *self.paused_secs.lock().unwrap() = 0.0;
        *self.earned_today.lock().unwrap() = 0.0;
        *self.last_tick.lock().unwrap() = None;
        *self.last_flush.lock().unwrap() = None;
        self.paused.store(false, Ordering::SeqCst);
    }
}

/// spawn 100ms tick 循环
pub fn spawn_clock(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(100));
        if let Err(e) = tick(&app) {
            eprintln!("[clock] tick error: {e:?}");
        }
    });
}

fn tick(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<ClockState>();
    let profile = load_profile(app);
    let now = Local::now();

    // 跨天检测（凌晨 2 点前归属前一天）
    let today = date_of_local(now);
    {
        let mut cur = state.current_date.lock().unwrap();
        match *cur {
            None => *cur = Some(today),
            Some(d) if d != today => {
                // 跨天：强制落库昨天，重置今日
                flush(app, &profile, d)?;
                state.reset_day();
                *cur = Some(today);
            }
            _ => {}
        }
    }

    // 时间差累计
    let now_inst = Instant::now();
    let delta = {
        let mut lt = state.last_tick.lock().unwrap();
        let d = lt.map(|t| now_inst.duration_since(t).as_secs_f64()).unwrap_or(0.0);
        *lt = Some(now_inst);
        d.min(3600.0) // 异常保护：单次最多按 1 小时计
    };

    let paused = state.paused.load(Ordering::SeqCst);
    let status = payroll::current_status(&profile, now, paused);

    // 只在"在岗且未暂停"时累计
    if status == Status::Working {
        // 休眠恢复：Instant 差值会包含休眠时间（macOS Instant 不跨休眠，Linux/Win 行为不同），
        // 这里用 worked_seconds_now 与累计值取大者兜底
        let natural = payroll::worked_seconds_now(&profile, now) as f64;
        let mut earned = state.earned_today.lock().unwrap();
        let rate = payroll::rate_per_sec(&profile);
        let incremental = delta * rate;
        *earned += incremental;
        // 兜底校正：若与"自然应赚"偏差超过 30 秒的钱，向自然值靠拢（处理休眠/挂起）
        let natural_earned = natural * rate;
        if (natural_earned - *earned).abs() > rate * 30.0 {
            *earned = natural_earned;
        }
    }

    // 每 60s 落库
    {
        let mut lf = state.last_flush.lock().unwrap();
        let should = match *lf {
            None => {
                *lf = Some(now_inst);
                false
            }
            Some(t) => now_inst.duration_since(t) >= Duration::from_secs(60),
        };
        if should {
            *lf = Some(now_inst);
            let earned = *state.earned_today.lock().unwrap();
            flush_with(app, &profile, today, earned)?;
        }
    }

    // 组装 tick payload
    let earned_today = *state.earned_today.lock().unwrap();
    let paused_secs = *state.paused_secs.lock().unwrap();
    let worked = (payroll::worked_seconds_now(&profile, now) as f64 - paused_secs).max(0.0);
    let planned = payroll::work_seconds_per_day(&profile) as f64;
    let payload = serde_json::json!({
        "now": now.to_rfc3339(),
        "status": status,
        "earnedToday": earned_today,
        "ratePerSec": payroll::rate_per_sec(&profile),
        "countdownSec": payroll::countdown_to_off(&profile, now),
        "workedSec": worked as i64,
        "plannedSec": planned as i64,
        "monthTotal": payroll::month_total(&profile, today, earned_today),
        "fullDayEarn": payroll::full_day_earn(&profile),
        "targetName": profile.target_name,
        "targetEtaSec": payroll::target_eta_sec(&profile, earned_today),
    });
    let _ = app.emit("tick", payload);
    Ok(())
}

fn flush(app: &AppHandle, profile: &Profile, day: chrono::NaiveDate) -> Result<(), Box<dyn std::error::Error>> {
    let earned = *app.state::<ClockState>().earned_today.lock().unwrap();
    flush_with(app, profile, day, earned)
}

fn flush_with(
    app: &AppHandle,
    profile: &Profile,
    day: chrono::NaiveDate,
    earned: f64,
) -> Result<(), Box<dyn std::error::Error>> {
    let db_path = app.path().app_data_dir()?.join("niuma.db");
    let store = Store::open(&db_path)?;
    let paused_secs = *app.state::<ClockState>().paused_secs.lock().unwrap();
    store.upsert_today(
        day,
        earned,
        payroll::full_day_earn(profile),
        (payroll::worked_seconds_now(profile, Local::now()) as f64 - paused_secs).max(0.0) as i64,
        payroll::work_seconds_per_day(profile),
        profile.monthly_salary,
        paused_secs as i64,
        0,
    )?;
    Ok(())
}

/// 从 plugin-store 读 profile（读不到用默认）
pub fn load_profile(app: &AppHandle) -> Profile {
    use tauri_plugin_store::StoreExt;
    let Ok(store) = app.store("profile.json") else {
        return Profile::default();
    };
    match store.get("profile") {
        Some(v) => serde_json::from_value(v).unwrap_or_default(),
        None => Profile::default(),
    }
}

/// 保存 profile
pub fn save_profile(app: &AppHandle, profile: &Profile) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_store::StoreExt;
    let store = app.store("profile.json")?;
    store.set("profile", serde_json::to_value(profile)?);
    store.save()?;
    Ok(())
}
