use std::path::PathBuf;

use crate::core::errors::TermifError;

#[cfg(target_os = "windows")]
pub fn default_shell_profile() -> &'static str {
    "powershell"
}

#[cfg(target_os = "macos")]
pub fn default_shell_profile() -> &'static str {
    "zsh"
}

#[cfg(all(unix, not(target_os = "macos")))]
pub fn default_shell_profile() -> &'static str {
    "bash"
}

pub fn home_dir() -> Result<PathBuf, TermifError> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .map(PathBuf::from)
            .map_err(|e| TermifError::Internal(e.to_string()))
    }

    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .map(PathBuf::from)
            .map_err(|e| TermifError::Internal(e.to_string()))
    }
}

pub fn ssh_config_path() -> Result<PathBuf, TermifError> {
    let ssh_dir = home_dir()?.join(".ssh");
    if !ssh_dir.exists() {
        std::fs::create_dir_all(&ssh_dir)?;
    }

    Ok(ssh_dir.join("config"))
}
