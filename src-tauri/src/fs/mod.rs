use std::{
    fs,
    path::PathBuf,
    time::UNIX_EPOCH,
};

use crate::core::{errors::TermifError, models::FileEntryDto};

// ── Local file operations ─────────────────────────────────────────────────────

pub fn list_local_entries(path: &str, show_hidden: bool) -> Result<Vec<FileEntryDto>, TermifError> {
    let mut entries = Vec::new();

    for item in fs::read_dir(path)? {
        let item = match item {
            Ok(entry) => entry,
            Err(_) => continue, // skip entries we can't read
        };

        let file_name = item.file_name().to_string_lossy().to_string();
        if !show_hidden && file_name.starts_with('.') {
            continue;
        }

        // Skip entries whose metadata we can't read (locked files, permission issues)
        let metadata = match item.metadata() {
            Ok(m) => m,
            Err(_) => {
                // Still include the entry with default values so it shows up in the list
                entries.push(FileEntryDto {
                    name: file_name,
                    path: item.path().to_string_lossy().to_string(),
                    is_dir: item.path().is_dir(),
                    size: 0,
                    modified_unix: None,
                });
                continue;
            }
        };

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
