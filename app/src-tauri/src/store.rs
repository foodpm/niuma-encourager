//! SQLite 存储层：每日结算 + 设置审计。
//! 数据位置：app_data_dir/niuma.db

use chrono::{DateTime, Local, NaiveDate};
use rusqlite::{params, Connection, Result as SqlResult};
use std::path::Path;
use std::sync::Mutex;

pub struct Store {
    conn: Mutex<Connection>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, serde::Serialize)]
pub struct DayEarning {
    pub date: String,
    pub earned: f64,
    pub full_day_earned: f64,
    pub worked_seconds: i64,
    pub planned_seconds: i64,
    pub monthly_salary_at_time: f64,
    pub break_seconds: i64,
    pub overtime_seconds: i64,
}

impl Store {
    pub fn open(db_path: &Path) -> SqlResult<Self> {
        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             CREATE TABLE IF NOT EXISTS day_earnings (
               date TEXT PRIMARY KEY,
               earned REAL NOT NULL,
               full_day_earned REAL NOT NULL,
               worked_seconds INTEGER NOT NULL,
               planned_seconds INTEGER NOT NULL,
               monthly_salary_at_time REAL NOT NULL,
               break_seconds INTEGER NOT NULL DEFAULT 0,
               overtime_seconds INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS settings_audit (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               changed_at TEXT NOT NULL,
               key TEXT NOT NULL,
               old_value TEXT,
               new_value TEXT
             );",
        )?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// UPSERT 当日结算（每 60s + 退出时调用）
    pub fn upsert_today(
        &self,
        today: NaiveDate,
        earned: f64,
        full_day: f64,
        worked_secs: i64,
        planned_secs: i64,
        salary: f64,
        break_secs: i64,
        overtime_secs: i64,
    ) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO day_earnings (date, earned, full_day_earned, worked_seconds, planned_seconds, monthly_salary_at_time, break_seconds, overtime_seconds)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
             ON CONFLICT(date) DO UPDATE SET
               earned=excluded.earned, full_day_earned=excluded.full_day_earned,
               worked_seconds=excluded.worked_seconds, planned_seconds=excluded.planned_seconds,
               monthly_salary_at_time=excluded.monthly_salary_at_time,
               break_seconds=excluded.break_seconds, overtime_seconds=excluded.overtime_seconds",
            params![
                today.format("%Y-%m-%d").to_string(),
                earned,
                full_day,
                worked_secs,
                planned_secs,
                salary,
                break_secs,
                overtime_secs
            ],
        )?;
        Ok(())
    }

    /// 当月 1 日至昨日已落库的天（用于月累计；缺失的工作日按满勤补算由 payroll.month_total 处理）
    #[allow(dead_code)]
    pub fn month_rows(&self, year: i32, month: u32) -> SqlResult<Vec<DayEarning>> {
        let conn = self.conn.lock().unwrap();
        let prefix = format!("{:04}-{:02}", year, month);
        let mut stmt = conn.prepare(
            "SELECT date, earned, full_day_earned, worked_seconds, planned_seconds, monthly_salary_at_time, break_seconds, overtime_seconds
             FROM day_earnings WHERE date LIKE ?1 || '%' ORDER BY date",
        )?;
        let rows = stmt
            .query_map(params![prefix], |r| {
                Ok(DayEarning {
                    date: r.get(0)?,
                    earned: r.get(1)?,
                    full_day_earned: r.get(2)?,
                    worked_seconds: r.get(3)?,
                    planned_seconds: r.get(4)?,
                    monthly_salary_at_time: r.get(5)?,
                    break_seconds: r.get(6)?,
                    overtime_seconds: r.get(7)?,
                })
            })?
            .collect::<SqlResult<Vec<_>>>()?;
        Ok(rows)
    }

    /// 记录设置变更审计
    pub fn audit_setting(&self, key: &str, old: Option<&str>, new: Option<&str>) -> SqlResult<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings_audit (changed_at, key, old_value, new_value) VALUES (?1,?2,?3,?4)",
            params![
                Local::now().to_rfc3339(),
                key,
                old,
                new
            ],
        )?;
        Ok(())
    }

    /// 导出 CSV 到指定路径
    pub fn export_csv(&self, out: &Path) -> Result<String, Box<dyn std::error::Error>> {
        use std::io::Write;
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT date, earned, full_day_earned, worked_seconds, planned_seconds, monthly_salary_at_time, break_seconds, overtime_seconds
             FROM day_earnings ORDER BY date",
        )?;
        let mut rows = stmt.query([])?;
        let mut f = std::fs::File::create(out)?;
        writeln!(f, "date,earned,full_day_earned,worked_seconds,planned_seconds,monthly_salary,break_seconds,overtime_seconds")?;
        while let Some(r) = rows.next()? {
            writeln!(
                f,
                "{},{},{},{},{},{},{},{}",
                r.get::<_, String>(0)?,
                r.get::<_, f64>(1)?,
                r.get::<_, f64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, f64>(5)?,
                r.get::<_, i64>(6)?,
                r.get::<_, i64>(7)?
            )?;
        }
        Ok(out.to_string_lossy().into_owned())
    }
}

/// 解析 "HH:MM" 为当日秒数（供跨天归属判断）
pub fn date_of_local(now: DateTime<Local>) -> NaiveDate {
    use chrono::Timelike;
    // 跨零点归属：凌晨 02:00 前仍算前一天
    let d = now.date_naive();
    if now.hour() < 2 {
        d.pred_opt().unwrap_or(d)
    } else {
        d
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_store_roundtrip() {
        let dir = std::env::temp_dir().join(format!("niuma-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Store::open(&dir.join("t.db")).unwrap();
        db.upsert_today(
            NaiveDate::from_ymd_opt(2026, 11, 3).unwrap(),
            79.1893,
            129.30,
            21936,
            27000,
            3000.0,
            600,
            0,
        )
        .unwrap();
        // 再写一次验证 UPSERT
        db.upsert_today(
            NaiveDate::from_ymd_opt(2026, 11, 3).unwrap(),
            80.0,
            129.30,
            22000,
            27000,
            3000.0,
            600,
            0,
        )
        .unwrap();
        let rows = db.month_rows(2026, 11).unwrap();
        assert_eq!(rows.len(), 1);
        assert!((rows[0].earned - 80.0).abs() < 1e-9);
        db.audit_setting("monthlySalary", Some("3000"), Some("5000")).unwrap();
        let csv_path = dir.join("export.csv");
        db.export_csv(&csv_path).unwrap();
        let csv = std::fs::read_to_string(&csv_path).unwrap();
        assert!(csv.contains("2026-11-03,80"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn test_cross_midnight_attribution() {
        // 01:00 → 归属前一天
        let now = Local.with_ymd_and_hms(2026, 11, 3, 1, 0, 0).single().unwrap();
        assert_eq!(date_of_local(now), NaiveDate::from_ymd_opt(2026, 11, 2).unwrap());
        let now = Local.with_ymd_and_hms(2026, 11, 3, 2, 0, 0).single().unwrap();
        assert_eq!(date_of_local(now), NaiveDate::from_ymd_opt(2026, 11, 3).unwrap());
    }

    use chrono::TimeZone as _;
}
