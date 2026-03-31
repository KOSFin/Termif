use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    time::UNIX_EPOCH,
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use crate::core::{errors::TermifError, models::FileEntryDto};

/// Windows flag to prevent console window from flashing when spawning child processes.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ── Local file operations ─────────────────────────────────────────────────────

pub fn list_local_entries(path: &str, show_hidden: bool) -> Result<Vec<FileEntryDto>, TermifError> {
    let mut entries = Vec::new();

    for item in fs::read_dir(path)? {
        let item = item?;
        let file_name = item.file_name().to_string_lossy().to_string();
        if !show_hidden && file_name.starts_with('.') {
            continue;
        }

        let metadata = item.metadata()?;
        let modified_unix = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|x| x.as_secs());

        entries.push(FileEntryDto {
            name: file_name,
            path: item.path().to_string_lossy().to_string(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified_unix,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            return b.is_dir.cmp(&a.is_dir);
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });

    Ok(entries)
}

pub fn read_text_file(path: &str) -> Result<String, TermifError> {
    Ok(fs::read_to_string(path)?)
}

pub fn write_text_file(path: &str, content: &str) -> Result<(), TermifError> {
    fs::write(path, content)?;
    Ok(())
}

pub fn create_entry(path: &str, is_dir: bool) -> Result<(), TermifError> {
    if is_dir {
        fs::create_dir_all(path)?;
    } else {
        fs::write(path, "")?;
    }
    Ok(())
}

pub fn rename_entry(from: &str, to: &str) -> Result<(), TermifError> {
    fs::rename(from, to)?;
    Ok(())
}

pub fn delete_entry(path: &str, is_dir: bool) -> Result<(), TermifError> {
    if is_dir {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }
    Ok(())
}

pub fn copy_entry(from: &str, to: &str) -> Result<(), TermifError> {
    let from_path = PathBuf::from(from);
    if from_path.is_dir() {
        return Err(TermifError::Unsupported(
            "directory copy not supported".to_string(),
        ));
    }
    fs::copy(from, to)?;
    Ok(())
}

// ── Remote SSH file operations ────────────────────────────────────────────────

/// List a remote directory using `ls -lA --time-style=+%s` for Unix timestamps.
/// Falls back to `ls -lA` if --time-style is not supported (BSD/macOS).
pub fn list_remote_entries_ssh(alias: &str, path: &str) -> Result<Vec<FileEntryDto>, TermifError> {
    let quoted = shell_single_quote(path);
    // Try GNU ls with Unix timestamps first; older ls versions may not support --time-style.
    let remote_cmd = format!(
        "ls -lA --time-style=+%s {} 2>/dev/null || ls -lA {}",
        quoted, quoted
    );

    let mut cmd = Command::new("ssh");
    cmd.arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=5")
        .arg(alias)
        .arg(&remote_cmd);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(TermifError::Internal(if stderr.is_empty() {
            "ssh ls failed".to_string()
        } else {
            stderr
        }));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    parse_ls_output(&text, path)
}

fn parse_ls_output(text: &str, base_path: &str) -> Result<Vec<FileEntryDto>, TermifError> {
    let mut result = Vec::new();

    for line in text.lines() {
        let line = line.trim();
        if line.starts_with("total ") || line.is_empty() {
            continue;
        }

        let parts: Vec<&str> = line
            .splitn(9, char::is_whitespace)
            .filter(|s| !s.is_empty())
            .collect();

        // Minimum fields: perms links user group size [timestamp] name
        // GNU ls with --time-style=+%s: perms links user group size timestamp name  (7+)
        // Traditional ls -la:           perms links user group size mon day time name (9+)
        if parts.len() < 7 {
            continue;
        }

        let perms = parts[0];
        let is_dir = perms.starts_with('d');
        let size = parts[4].parse::<u64>().unwrap_or(0);

        // Detect format: if parts[5] looks like a Unix timestamp (all digits, 9-10 chars)
        let (modified_unix, name) = if parts.len() >= 7
            && parts[5].chars().all(|c| c.is_ascii_digit())
            && parts[5].len() >= 9
        {
            // GNU --time-style=+%s format: field 5 = timestamp, field 6+ = name
            let ts = parts[5].parse::<u64>().ok();
            let name = parts[6..].join(" ");
            (ts, name)
        } else if parts.len() >= 9 {
            // Traditional: fields 5-7 = date/time, field 8+ = name
            let name = parts[8..].join(" ");
            (None, name)
        } else {
            continue;
        };

        if name == "." || name == ".." {
            continue;
        }

        // Strip symlink target " -> dest"
        let name = name.split(" -> ").next().unwrap_or(&name).to_string();

        let remote_path = if base_path.ends_with('/') {
            format!("{}{}", base_path, name)
        } else {
            format!("{}/{}", base_path, name)
        };

        result.push(FileEntryDto {
            name,
            path: remote_path,
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

/// Read a text file from a remote host via SSH exec + `cat`.
pub fn read_remote_text_file(alias: &str, path: &str) -> Result<String, TermifError> {
    let quoted = shell_single_quote(path);
    let mut cmd = Command::new("ssh");
    cmd.arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=5")
        .arg(alias)
        .arg(format!("cat {}", quoted));

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(TermifError::Internal(if stderr.is_empty() {
            format!("cannot read remote file: {}", path)
        } else {
            stderr
        }));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Write a text file to a remote host via SSH exec + stdin pipe.
pub fn write_remote_text_file(alias: &str, path: &str, content: &str) -> Result<(), TermifError> {
    let quoted = shell_single_quote(path);
    let mut cmd = Command::new("ssh");
    cmd.arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=5")
        .arg(alias)
        .arg(format!("cat > {}", quoted))
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn()?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(content.as_bytes())?;
    }

    let result = child.wait_with_output()?;
    if !result.status.success() {
        let stderr = String::from_utf8_lossy(&result.stderr).trim().to_string();
        return Err(TermifError::Internal(if stderr.is_empty() {
            format!("cannot write remote file: {}", path)
        } else {
            stderr
        }));
    }

    Ok(())
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
