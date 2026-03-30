use thiserror::Error;

#[derive(Debug, Error)]
pub enum TermifError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("session not found: {0}")]
    SessionNotFound(String),
    #[error("unsupported operation: {0}")]
    Unsupported(String),
    #[error("internal error: {0}")]
    Internal(String),
}

impl From<anyhow::Error> for TermifError {
    fn from(value: anyhow::Error) -> Self {
        Self::Internal(value.to_string())
    }
}
