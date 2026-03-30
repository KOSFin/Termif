use std::{
    collections::HashMap,
    io::{Read, Write},
    sync::{mpsc, Arc, Mutex},
    thread,
    time::Duration,
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use uuid::Uuid;

use crate::core::{
    errors::TermifError,
    models::{SessionDto, SessionKind},
};

enum SessionControl {
    Input(String),
    Resize { cols: u16, rows: u16 },
    Shutdown,
}

#[derive(Clone)]
struct SessionRuntime {
    dto: SessionDto,
    control_tx: mpsc::Sender<SessionControl>,
    output: Arc<Mutex<Vec<u8>>>,
}

#[derive(Clone, Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, SessionRuntime>>>,
}

impl TerminalManager {
    pub fn spawn_local_session(
        &self,
        shell_profile: Option<String>,
        cwd: Option<String>,
    ) -> Result<SessionDto, TermifError> {
        let (program, args, title) = resolve_local_shell(shell_profile);
        let dto = SessionDto {
            id: Uuid::new_v4().to_string(),
            kind: SessionKind::Local,
            title,
            shell: program.clone(),
            cwd: cwd.clone(),
            ssh_alias: None,
        };

        self.spawn_session(dto, program, args, cwd)
    }

    pub fn spawn_ssh_session(&self, host_alias: String) -> Result<SessionDto, TermifError> {
        let dto = SessionDto {
            id: Uuid::new_v4().to_string(),
            kind: SessionKind::Ssh,
            title: format!("SSH: {}", host_alias),
            shell: "ssh".to_string(),
            cwd: None,
            ssh_alias: Some(host_alias.clone()),
        };

        self.spawn_session(dto, "ssh".to_string(), vec![host_alias], None)
    }

    fn spawn_session(
        &self,
        dto: SessionDto,
        program: String,
        args: Vec<String>,
        cwd: Option<String>,
    ) -> Result<SessionDto, TermifError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 32,
                cols: 120,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        let mut command = CommandBuilder::new(program);
        for arg in args {
            command.arg(arg);
        }
        if let Some(path) = &cwd {
            command.cwd(path);
        }

        let _child = pair
            .slave
            .spawn_command(command)
            .map_err(|e| TermifError::Internal(e.to_string()))?;
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| TermifError::Internal(e.to_string()))?;
        let mut writer = pair
            .master
            .take_writer()
            .map_err(|e| TermifError::Internal(e.to_string()))?;
        let mut master = pair.master;

        let output = Arc::new(Mutex::new(Vec::<u8>::with_capacity(16 * 1024)));
        let output_for_reader = Arc::clone(&output);
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut lock = output_for_reader
                            .lock()
                            .expect("output buffer lock poisoned");
                        lock.extend_from_slice(&buf[..n]);
                        if lock.len() > 4_000_000 {
                            let drain = lock.len().saturating_sub(2_500_000);
                            lock.drain(0..drain);
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        let (control_tx, control_rx) = mpsc::channel::<SessionControl>();
        thread::spawn(move || loop {
            match control_rx.recv_timeout(Duration::from_millis(40)) {
                Ok(SessionControl::Input(data)) => {
                    let _ = writer.write_all(data.as_bytes());
                    let _ = writer.flush();
                }
                Ok(SessionControl::Resize { cols, rows }) => {
                    let _ = master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                Ok(SessionControl::Shutdown) => {
                    let _ = writer.write_all(b"exit\r");
                    let _ = writer.flush();
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        });

        let runtime = SessionRuntime {
            dto: dto.clone(),
            control_tx,
            output,
        };

        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .insert(dto.id.clone(), runtime);

        Ok(dto)
    }

    pub fn get_session(&self, session_id: &str) -> Option<SessionDto> {
        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .get(session_id)
            .map(|s| s.dto.clone())
    }

    pub fn send_input(&self, session_id: &str, data: String) -> Result<(), TermifError> {
        let sessions = self.sessions.lock().expect("sessions lock poisoned");
        let session = sessions
            .get(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;
        session
            .control_tx
            .send(SessionControl::Input(data))
            .map_err(|e| TermifError::Internal(e.to_string()))
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), TermifError> {
        let sessions = self.sessions.lock().expect("sessions lock poisoned");
        let session = sessions
            .get(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;
        session
            .control_tx
            .send(SessionControl::Resize { cols, rows })
            .map_err(|e| TermifError::Internal(e.to_string()))
    }

    pub fn read_output(&self, session_id: &str) -> Result<String, TermifError> {
        let sessions = self.sessions.lock().expect("sessions lock poisoned");
        let session = sessions
            .get(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;

        let mut output = session.output.lock().expect("output buffer lock poisoned");
        if output.is_empty() {
            return Ok(String::new());
        }

        let bytes = std::mem::take(&mut *output);
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), TermifError> {
        let mut sessions = self.sessions.lock().expect("sessions lock poisoned");
        let session = sessions
            .remove(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;
        let _ = session.control_tx.send(SessionControl::Shutdown);
        Ok(())
    }
}

fn resolve_local_shell(shell_profile: Option<String>) -> (String, Vec<String>, String) {
    match shell_profile
        .unwrap_or_else(|| "powershell".to_string())
        .to_lowercase()
        .as_str()
    {
        "cmd" | "cmd.exe" => ("cmd.exe".to_string(), vec![], "CMD".to_string()),
        "pwsh" | "powershell7" => (
            "pwsh.exe".to_string(),
            vec!["-NoLogo".to_string()],
            "PowerShell 7".to_string(),
        ),
        _ => (
            "powershell.exe".to_string(),
            vec!["-NoLogo".to_string()],
            "PowerShell".to_string(),
        ),
    }
}
