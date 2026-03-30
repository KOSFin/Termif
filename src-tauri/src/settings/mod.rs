use std::sync::{Arc, Mutex};

use crate::{core::errors::TermifError, core::models::AppSettings, persistence::Persistence};

#[derive(Clone)]
pub struct SettingsStore {
    persistence: Persistence,
    value: Arc<Mutex<AppSettings>>,
}

impl SettingsStore {
    pub fn new(persistence: Persistence) -> Result<Self, TermifError> {
        let settings: AppSettings = persistence.load_or_default("settings.json")?;
        Ok(Self {
            persistence,
            value: Arc::new(Mutex::new(settings)),
        })
    }

    pub fn get(&self) -> AppSettings {
        self.value.lock().expect("settings lock poisoned").clone()
    }

    pub fn set(&self, settings: AppSettings) -> Result<(), TermifError> {
        self.persistence.save("settings.json", &settings)?;
        *self.value.lock().expect("settings lock poisoned") = settings;
        Ok(())
    }
}
