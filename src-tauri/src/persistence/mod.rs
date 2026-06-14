use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{de::DeserializeOwned, Serialize};
use tauri::{AppHandle, Manager};

use crate::core::errors::TermifError;

#[derive(Clone)]
pub struct Persistence {
    root: PathBuf,
}

impl Persistence {
    pub fn from_app(app: &AppHandle) -> Result<Self, TermifError> {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|e| TermifError::Internal(e.to_string()))?;
        fs::create_dir_all(&root)?;
        let legacy_roots = legacy_app_data_dirs(&root);
        migrate_legacy_data(&root, &legacy_roots)?;
        Ok(Self { root })
    }

    pub fn load_or_default<T>(&self, file_name: &str) -> Result<T, TermifError>
    where
        T: DeserializeOwned + Default,
    {
        let file = self.root.join(file_name);
        if !file.exists() {
            return Ok(T::default());
        }
        let bytes = fs::read(file)?;
        let data = serde_json::from_slice::<T>(&bytes)?;
        Ok(data)
    }

    pub fn save<T>(&self, file_name: &str, value: &T) -> Result<(), TermifError>
    where
        T: Serialize,
    {
        let file = self.root.join(file_name);
        let tmp = self.root.join(format!("{}.tmp", file_name));
        let json = serde_json::to_vec_pretty(value)?;
        fs::write(&tmp, json)?;
        fs::rename(tmp, file)?;
        Ok(())
    }
}

fn legacy_app_data_dirs(root: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(parent) = root.parent() {
        for legacy in ["com.termif", "termif"] {
            let candidate = parent.join(legacy);
            if candidate != root {
                dirs.push(candidate);
            }
        }
    }
    dirs
}

fn migrate_legacy_data(root: &Path, legacy_roots: &[PathBuf]) -> Result<(), TermifError> {
    for file_name in ["settings.json", "hosts.json", "ui_state.json"] {
        let current = root.join(file_name);
        let mut preferred_source: Option<PathBuf> = None;

        for legacy_root in legacy_roots {
            if !legacy_root.exists() {
                continue;
            }

            let legacy = legacy_root.join(file_name);
            if !legacy.exists() {
                continue;
            }

            let should_replace = match preferred_source.as_ref() {
                Some(existing) => file_should_replace(existing, &legacy)?,
                None => true,
            };

            if should_replace {
                preferred_source = Some(legacy);
            }
        }

        let Some(source) = preferred_source else {
            continue;
        };

        if !current.exists() || file_should_replace(&current, &source)? {
            fs::copy(source, current)?;
        }
    }

    Ok(())
}

fn file_should_replace(current: &Path, candidate: &Path) -> Result<bool, TermifError> {
    if !current.exists() {
        return Ok(true);
    }

    let current_meta = fs::metadata(current)?;
    let candidate_meta = fs::metadata(candidate)?;

    Ok(current_meta.len() == 0 || candidate_meta.len() > current_meta.len())
}
