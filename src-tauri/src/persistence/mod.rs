use std::{fs, path::PathBuf};

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
