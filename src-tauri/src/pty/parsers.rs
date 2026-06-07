use std::collections::HashSet;

use crate::core::{
    errors::TermifError,
    models::{FileEntryDto, SystemStatsDto},
};

const REACH_SEP: &str = "===REACH_SEP===";

pub(super) fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

pub(super) fn parse_ls_output(
    text: &str,
    base_path: &str,
) -> Result<Vec<FileEntryDto>, TermifError> {
    let mut result = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if line.starts_with("total ") || line.is_empty() {
            continue;
        }

        let collapsed = line.split_whitespace().collect::<Vec<_>>().join(" ");
        let parts: Vec<&str> = collapsed.splitn(9, ' ').collect();
        if parts.len() < 7 {
            continue;
        }

        let perms = parts[0];
        let is_dir = perms.starts_with('d');
        let size = parts[4].parse::<u64>().unwrap_or(0);

        let (modified_unix, name) =
            if parts[5].chars().all(|c| c.is_ascii_digit()) && parts[5].len() >= 9 {
                let ts = parts[5].parse::<u64>().ok();
                (ts, parts[6..].join(" "))
            } else if parts.len() >= 9 {
                (None, parts[8..].join(" "))
            } else {
                continue;
            };

        if name.is_empty() || name == "." || name == ".." {
            continue;
        }

        let name = name.split(" -> ").next().unwrap_or(&name).to_string();
        let path = if base_path.ends_with('/') {
            format!("{}{}", base_path, name)
        } else {
            format!("{}/{}", base_path, name)
        };

        result.push(FileEntryDto {
            name,
            path,
            is_dir,
            size,
            modified_unix,
        });
    }

    result.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return b.is_dir.cmp(&a.is_dir);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });

    Ok(result)
}

pub(super) fn parse_system_stats(output: &str) -> SystemStatsDto {
    let sections: Vec<&str> = output.split(REACH_SEP).collect();
    let cpu_section = sections.first().copied().unwrap_or_default();
    let meminfo_section = sections.get(1).copied().unwrap_or_default();
    let disk_section = sections.get(2).copied().unwrap_or_default();
    let users_section = sections.get(3).copied().unwrap_or_default();
    let clock_section = sections.get(4).copied().unwrap_or_default();
    let user_names = parse_user_names(users_section);
    let (server_time_epoch, server_tz) = parse_server_clock(clock_section);

    SystemStatsDto {
        cpu: parse_cpu_percent(cpu_section),
        ram: parse_ram_percent(meminfo_section),
        disk: parse_disk_percent(disk_section),
        users: Some(user_names.len() as u32),
        user_names: if user_names.is_empty() {
            None
        } else {
            Some(user_names)
        },
        server_time_epoch,
        server_tz,
    }
}

fn parse_cpu_percent(cpu_section: &str) -> Option<f32> {
    let mut samples = cpu_section
        .lines()
        .map(str::trim)
        .filter(|line| line.starts_with("cpu "))
        .filter_map(parse_cpu_snapshot);

    let first = samples.next()?;
    let second = samples.next()?;

    let total_delta = second.total.saturating_sub(first.total);
    if total_delta == 0 {
        return None;
    }

    let idle_delta = second.idle.saturating_sub(first.idle);
    let busy_delta = total_delta.saturating_sub(idle_delta);
    Some(((busy_delta as f32 / total_delta as f32) * 100.0).clamp(0.0, 100.0))
}

fn parse_ram_percent(meminfo_section: &str) -> Option<f32> {
    let mut mem_total_kb: Option<u64> = None;
    let mut mem_available_kb: Option<u64> = None;

    for line in meminfo_section.lines() {
        let Some((key, raw)) = line.split_once(':') else {
            continue;
        };

        let value_kb = raw
            .split_whitespace()
            .next()
            .and_then(|v| v.parse::<u64>().ok());

        match key.trim() {
            "MemTotal" => mem_total_kb = value_kb,
            "MemAvailable" => mem_available_kb = value_kb,
            _ => {}
        }
    }

    let total = mem_total_kb?;
    let available = mem_available_kb?;
    if total == 0 {
        return None;
    }

    let used = total.saturating_sub(available);
    Some(((used as f32 / total as f32) * 100.0).clamp(0.0, 100.0))
}

fn parse_disk_percent(disk_section: &str) -> Option<f32> {
    for line in disk_section
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        if line.starts_with("Filesystem") {
            continue;
        }

        let cols: Vec<&str> = line.split_whitespace().collect();
        if cols.len() < 6 {
            continue;
        }

        if cols[5] == "/" {
            return cols[4].trim_end_matches('%').parse::<f32>().ok();
        }
    }

    None
}

fn parse_user_names(users_section: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();

    for line in users_section
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let Some(first_col) = line.split_whitespace().next() else {
            continue;
        };
        if seen.insert(first_col.to_string()) {
            names.push(first_col.to_string());
        }
    }

    names
}

fn parse_server_clock(clock_section: &str) -> (Option<i64>, Option<String>) {
    for line in clock_section
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        let mut cols = line.split_whitespace();
        let epoch = cols.next().and_then(|raw| raw.parse::<i64>().ok());
        if let Some(epoch) = epoch {
            let tz = cols.next().map(|value| value.to_string());
            return (Some(epoch), tz);
        }
    }

    (None, None)
}

#[derive(Debug, Clone, Copy)]
struct CpuSnapshot {
    total: u64,
    idle: u64,
}

fn parse_cpu_snapshot(line: &str) -> Option<CpuSnapshot> {
    let mut cols = line.split_whitespace();
    if cols.next()? != "cpu" {
        return None;
    }

    let values: Vec<u64> = cols.filter_map(|x| x.parse::<u64>().ok()).collect();
    if values.len() < 4 {
        return None;
    }

    let idle = values.get(3).copied().unwrap_or(0) + values.get(4).copied().unwrap_or(0);
    let total = values.iter().sum();
    Some(CpuSnapshot { total, idle })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_shell_values_safely() {
        assert_eq!(shell_single_quote("plain"), "'plain'");
        assert_eq!(shell_single_quote("it's fine"), "'it'\\''s fine'");
    }

    #[test]
    fn parses_gnu_ls_entries_and_sorts_dirs_first() {
        let output = "\
total 4
-rw-r--r-- 1 d staff 12 1710000000 beta.txt
drwxr-xr-x 2 d staff 64 1710000001 alpha
lrwxr-xr-x 1 d staff 8 1710000002 link -> target
";

        let entries = parse_ls_output(output, "/tmp").expect("parse ls");

        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "alpha");
        assert!(entries[0].is_dir);
        assert_eq!(entries[1].name, "beta.txt");
        assert_eq!(entries[1].path, "/tmp/beta.txt");
        assert_eq!(entries[2].name, "link");
    }

    #[test]
    fn parses_bsd_ls_entries_without_epoch() {
        let output = "-rw-r--r-- 1 d staff 20 Jun 7 21:00 notes.md";
        let entries = parse_ls_output(output, "/Users/d").expect("parse bsd ls");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "notes.md");
        assert_eq!(entries[0].modified_unix, None);
    }

    #[test]
    fn parses_system_stats_sections() {
        let output = "\
cpu  100 0 100 800 0 0 0 0 0 0
cpu  150 0 150 900 0 0 0 0 0 0
===REACH_SEP===
MemTotal:       1000 kB
MemAvailable:    250 kB
===REACH_SEP===
Filesystem 1024-blocks Used Available Capacity Mounted on
/dev/root 100 42 58 42% /
===REACH_SEP===
alice pts/0
bob pts/1
alice pts/2
===REACH_SEP===
1710000000 UTC
";

        let stats = parse_system_stats(output);

        assert_eq!(stats.cpu.map(|v| v.round() as u32), Some(50));
        assert_eq!(stats.ram.map(|v| v.round() as u32), Some(75));
        assert_eq!(stats.disk, Some(42.0));
        assert_eq!(stats.users, Some(2));
        assert_eq!(stats.user_names, Some(vec!["alice".to_string(), "bob".to_string()]));
        assert_eq!(stats.server_time_epoch, Some(1710000000));
        assert_eq!(stats.server_tz, Some("UTC".to_string()));
    }
}
