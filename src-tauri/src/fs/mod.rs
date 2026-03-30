use std::{fs, path::PathBuf, process::Command, time::UNIX_EPOCH};

use crate::core::{errors::TermifError, models::FileEntryDto};

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
            "directory copy is not implemented for MVP".to_string(),
        ));
    }
    fs::copy(from, to)?;
    Ok(())
}

pub fn list_remote_entries_ssh(alias: &str, path: &str) -> Result<Vec<FileEntryDto>, TermifError> {
    let quoted = shell_single_quote(path);
    let remote_cmd = format!("ls -la {}", quoted);

    let output = Command::new("ssh")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ConnectTimeout=5")
        .arg(alias)
        .arg(remote_cmd)
        .output()?;

    if !output.status.success() {
        return Err(TermifError::Internal(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut result = Vec::new();

    for line in text.lines() {
        if line.starts_with("total ") || line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 9 {
            continue;
        }
        let perms = parts[0];
        let is_dir = perms.starts_with('d');
        let size = parts[4].parse::<u64>().unwrap_or(0);
        let name = parts[8..].join(" ");
        if name == "." || name == ".." {
            continue;
        }

        let remote_path = if path.ends_with('/') {
            format!("{}{}", path, name)
        } else {
            format!("{}/{}", path, name)
        };

        result.push(FileEntryDto {
            name,
            path: remote_path,
            is_dir,
            size,
            modified_unix: None,
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

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}
