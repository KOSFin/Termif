use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use russh::{
    client, keys::load_secret_key, keys::PrivateKeyWithHashAlg, Channel, ChannelMsg, Disconnect,
};
use tauri::ipc::Channel as FrontendChannel;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use crate::core::{
    errors::TermifError,
    models::{FileEntryDto, SessionDto, SessionKind, SystemStatsDto},
};

const DIR_CACHE_TTL: Duration = Duration::from_millis(1_500);
const MONITORING_SCRIPT: &str = "grep '^cpu ' /proc/stat 2>/dev/null; sleep 0.5; grep '^cpu ' /proc/stat 2>/dev/null; echo '===REACH_SEP==='; cat /proc/meminfo; echo '===REACH_SEP==='; df -P /; echo '===REACH_SEP==='; w -hs || who";
const REACH_SEP: &str = "===REACH_SEP===";

#[derive(Clone, Debug)]
pub struct SshConnectOptions {
    pub alias: String,
    pub host: String,
    pub user: Option<String>,
    pub port: u16,
    pub identity_file: Option<String>,
}

#[derive(Clone, Default)]
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, SessionRuntime>>>,
}

enum SessionRuntime {
    Local(LocalSessionRuntime),
    Ssh(SshSessionRuntime),
}

struct LocalSessionRuntime {
    dto: SessionDto,
    control_tx: mpsc::Sender<LocalControl>,
    pending: Arc<Mutex<Vec<u8>>>,
    channel: Arc<Mutex<Option<FrontendChannel<String>>>>,
}

struct SshSessionRuntime {
    dto: SessionDto,
    control_tx: tokio::sync::mpsc::UnboundedSender<SshControl>,
    pending: Arc<Mutex<Vec<u8>>>,
    channel: Arc<Mutex<Option<FrontendChannel<String>>>>,
    client: Arc<SshClientRuntime>,
}

#[derive(Debug)]
enum LocalControl {
    Input(String),
    Resize { cols: u16, rows: u16 },
    Shutdown,
}

#[derive(Debug)]
enum SshControl {
    Input(String),
    Resize { cols: u16, rows: u16 },
    Shutdown,
}

#[derive(Clone)]
struct SshClientRuntime {
    handle: client::Handle<SshHandler>,
    dir_cache: Arc<tokio::sync::Mutex<HashMap<String, DirCacheEntry>>>,
}

struct DirCacheEntry {
    created_at: Instant,
    entries: Vec<FileEntryDto>,
}

struct ExecOutput {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    exit_status: Option<u32>,
}

#[derive(Clone)]
struct SshHandler;

impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
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
        let master = pair.master;

        let pending: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::with_capacity(16 * 1024)));
        let channel: Arc<Mutex<Option<FrontendChannel<String>>>> = Arc::new(Mutex::new(None));

        let pending_r = Arc::clone(&pending);
        let channel_r = Arc::clone(&channel);

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => push_output(&pending_r, &channel_r, &buf[..n]),
                    Err(_) => break,
                }
            }
        });

        let (control_tx, control_rx) = mpsc::channel::<LocalControl>();
        thread::spawn(move || {
            loop {
                match control_rx.recv_timeout(Duration::from_millis(40)) {
                    Ok(LocalControl::Input(data)) => {
                        let _ = writer.write_all(data.as_bytes());
                        let _ = writer.flush();
                    }
                    Ok(LocalControl::Resize { cols, rows }) => {
                        let _ = master.resize(PtySize {
                            rows,
                            cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                    Ok(LocalControl::Shutdown) => {
                        let _ = writer.write_all(b"exit\r");
                        let _ = writer.flush();
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        let runtime = LocalSessionRuntime {
            dto: dto.clone(),
            control_tx,
            pending,
            channel,
        };

        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .insert(dto.id.clone(), SessionRuntime::Local(runtime));

        Ok(dto)
    }

    pub async fn spawn_ssh_session(
        &self,
        options: SshConnectOptions,
    ) -> Result<SessionDto, TermifError> {
        let dto = SessionDto {
            id: Uuid::new_v4().to_string(),
            kind: SessionKind::Ssh,
            title: format!("SSH: {}", options.alias),
            shell: "russh".to_string(),
            cwd: None,
            ssh_alias: Some(options.alias.clone()),
        };

        let sessions = Arc::clone(&self.sessions);
        let dto_clone = dto.clone();

        let client = Arc::new(SshClientRuntime::connect(&options).await?);
        let channel = client.open_shell_channel(120, 32).await?;

        let pending: Arc<Mutex<Vec<u8>>> = Arc::new(Mutex::new(Vec::with_capacity(16 * 1024)));
        let push_channel: Arc<Mutex<Option<FrontendChannel<String>>>> = Arc::new(Mutex::new(None));
        let (control_tx, control_rx) = tokio::sync::mpsc::unbounded_channel::<SshControl>();

        tauri::async_runtime::spawn(ssh_channel_loop(
            channel,
            control_rx,
            Arc::clone(&pending),
            Arc::clone(&push_channel),
        ));

        let runtime = SshSessionRuntime {
            dto: dto_clone.clone(),
            control_tx,
            pending,
            channel: push_channel,
            client,
        };

        sessions
            .lock()
            .expect("sessions lock poisoned")
            .insert(dto_clone.id.clone(), SessionRuntime::Ssh(runtime));

        Ok(dto_clone)
    }

    pub fn attach_channel(&self, session_id: &str, ch: FrontendChannel<String>) -> Result<(), TermifError> {
        let mut lock = self.sessions.lock().expect("sessions lock poisoned");
        let runtime = lock
            .get_mut(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;

        match runtime {
            SessionRuntime::Local(local) => {
                flush_pending_to_channel(&local.pending, &ch);
                *local.channel.lock().expect("channel lock poisoned") = Some(ch);
            }
            SessionRuntime::Ssh(ssh) => {
                flush_pending_to_channel(&ssh.pending, &ch);
                *ssh.channel.lock().expect("channel lock poisoned") = Some(ch);
            }
        }

        Ok(())
    }

    pub fn get_session(&self, session_id: &str) -> Option<SessionDto> {
        self.sessions
            .lock()
            .expect("sessions lock poisoned")
            .get(session_id)
            .map(|runtime| match runtime {
                SessionRuntime::Local(local) => local.dto.clone(),
                SessionRuntime::Ssh(ssh) => ssh.dto.clone(),
            })
    }

    pub fn send_input(&self, session_id: &str, data: String) -> Result<(), TermifError> {
        let sessions = self.sessions.lock().expect("sessions lock poisoned");
        let runtime = sessions
            .get(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;

        match runtime {
            SessionRuntime::Local(local) => local
                .control_tx
                .send(LocalControl::Input(data))
                .map_err(|e| TermifError::Internal(e.to_string())),
            SessionRuntime::Ssh(ssh) => ssh
                .control_tx
                .send(SshControl::Input(data))
                .map_err(|e| TermifError::Internal(e.to_string())),
        }
    }

    pub fn resize(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), TermifError> {
        let sessions = self.sessions.lock().expect("sessions lock poisoned");
        let runtime = sessions
            .get(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;

        match runtime {
            SessionRuntime::Local(local) => local
                .control_tx
                .send(LocalControl::Resize { cols, rows })
                .map_err(|e| TermifError::Internal(e.to_string())),
            SessionRuntime::Ssh(ssh) => ssh
                .control_tx
                .send(SshControl::Resize { cols, rows })
                .map_err(|e| TermifError::Internal(e.to_string())),
        }
    }

    pub fn read_output(&self, session_id: &str) -> Result<String, TermifError> {
        let sessions = self.sessions.lock().expect("sessions lock poisoned");
        let runtime = sessions
            .get(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;

        let pending = match runtime {
            SessionRuntime::Local(local) => &local.pending,
            SessionRuntime::Ssh(ssh) => &ssh.pending,
        };

        let mut pending_lock = pending.lock().expect("pending lock poisoned");
        if pending_lock.is_empty() {
            return Ok(String::new());
        }

        let bytes = std::mem::take(&mut *pending_lock);
        Ok(String::from_utf8_lossy(&bytes).into_owned())
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), TermifError> {
        let mut sessions = self.sessions.lock().expect("sessions lock poisoned");
        let runtime = sessions
            .remove(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;

        match runtime {
            SessionRuntime::Local(local) => {
                let _ = local.control_tx.send(LocalControl::Shutdown);
            }
            SessionRuntime::Ssh(ssh) => {
                let _ = ssh.control_tx.send(SshControl::Shutdown);
                let handle = ssh.client.handle.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = handle
                        .disconnect(Disconnect::ByApplication, "", "English")
                        .await;
                });
            }
        }

        Ok(())
    }

    pub fn close_all_sessions(&self) {
        let runtimes = {
            let mut sessions = self.sessions.lock().expect("sessions lock poisoned");
            sessions.drain().map(|(_, runtime)| runtime).collect::<Vec<_>>()
        };

        for runtime in runtimes {
            match runtime {
                SessionRuntime::Local(local) => {
                    let _ = local.control_tx.send(LocalControl::Shutdown);
                }
                SessionRuntime::Ssh(ssh) => {
                    let _ = ssh.control_tx.send(SshControl::Shutdown);
                    let handle = ssh.client.handle.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = handle
                            .disconnect(Disconnect::ByApplication, "", "English")
                            .await;
                    });
                }
            }
        }
    }

    pub async fn list_remote_entries(
        &self,
        session_id: &str,
        path: &str,
    ) -> Result<Vec<FileEntryDto>, TermifError> {
        let client = self.ssh_client(session_id)?;
        client.list_remote_entries(path).await
    }

    pub async fn read_remote_text_file(
        &self,
        session_id: &str,
        path: &str,
    ) -> Result<String, TermifError> {
        let client = self.ssh_client(session_id)?;
        client.read_remote_text_file(path).await
    }

    pub async fn write_remote_text_file(
        &self,
        session_id: &str,
        path: &str,
        content: &str,
    ) -> Result<(), TermifError> {
        let client = self.ssh_client(session_id)?;
        client.write_remote_text_file(path, content).await
    }

    pub async fn fetch_system_stats(&self, session_id: &str) -> Result<SystemStatsDto, TermifError> {
        let client = self.ssh_client(session_id)?;
        client.collect_system_stats().await
    }

    fn ssh_client(&self, session_id: &str) -> Result<Arc<SshClientRuntime>, TermifError> {
        let sessions = self.sessions.lock().expect("sessions lock poisoned");
        let runtime = sessions
            .get(session_id)
            .ok_or_else(|| TermifError::SessionNotFound(session_id.to_string()))?;

        match runtime {
            SessionRuntime::Ssh(ssh) => Ok(Arc::clone(&ssh.client)),
            SessionRuntime::Local(_) => Err(TermifError::Unsupported(
                "remote operation is available only for SSH sessions".to_string(),
            )),
        }
    }
}

impl SshClientRuntime {
    async fn connect(options: &SshConnectOptions) -> Result<Self, TermifError> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(30)),
            ..Default::default()
        });

        let mut handle = client::connect(config, (options.host.as_str(), options.port), SshHandler)
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        let user = resolve_ssh_user(options);
        let key_path = resolve_ssh_key_path(options)?;
        let key_pair = load_secret_key(&key_path, None)
            .map_err(|e| TermifError::Internal(format!("failed to load ssh key {}: {}", key_path.display(), e)))?;

        let rsa_hash = handle
            .best_supported_rsa_hash()
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        let auth = handle
            .authenticate_publickey(
                user,
                PrivateKeyWithHashAlg::new(Arc::new(key_pair), rsa_hash.flatten()),
            )
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        if !auth.success() {
            return Err(TermifError::Internal(
                "ssh authentication failed".to_string(),
            ));
        }

        Ok(Self {
            handle,
            dir_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        })
    }

    async fn open_shell_channel(
        &self,
        cols: u16,
        rows: u16,
    ) -> Result<Channel<client::Msg>, TermifError> {
        let channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        channel
            .request_pty(false, "xterm-256color", cols as u32, rows as u32, 0, 0, &[])
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        channel
            .request_shell(true)
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        Ok(channel)
    }

    async fn exec_capture(
        &self,
        command: &str,
        stdin_payload: Option<&[u8]>,
    ) -> Result<ExecOutput, TermifError> {
        let mut channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        if let Some(payload) = stdin_payload {
            let mut writer = channel.make_writer();
            writer
                .write_all(payload)
                .await
                .map_err(|e| TermifError::Internal(e.to_string()))?;
            writer
                .flush()
                .await
                .map_err(|e| TermifError::Internal(e.to_string()))?;
            drop(writer);
            let _ = channel.eof().await;
        }

        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut exit_status = None;

        while let Some(msg) = channel.wait().await {
            match msg {
                ChannelMsg::Data { data } => stdout.extend_from_slice(&data),
                ChannelMsg::ExtendedData { data, .. } => stderr.extend_from_slice(&data),
                ChannelMsg::ExitStatus { exit_status: code } => exit_status = Some(code),
                _ => {}
            }
        }

        Ok(ExecOutput {
            stdout,
            stderr,
            exit_status,
        })
    }

    async fn list_remote_entries(&self, path: &str) -> Result<Vec<FileEntryDto>, TermifError> {
        {
            let cache = self.dir_cache.lock().await;
            if let Some(entry) = cache.get(path) {
                if entry.created_at.elapsed() <= DIR_CACHE_TTL {
                    return Ok(entry.entries.clone());
                }
            }
        }

        let quoted = shell_single_quote(path);
        let command = format!(
            "ls -lA --time-style=+%s {} 2>/dev/null || ls -lA {}",
            quoted, quoted
        );

        let output = self.exec_capture(&command, None).await?;
        if output.exit_status.unwrap_or(1) != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(TermifError::Internal(if stderr.is_empty() {
                "remote ls failed".to_string()
            } else {
                stderr
            }));
        }

        let text = String::from_utf8_lossy(&output.stdout);
        let entries = parse_ls_output(&text, path)?;

        let mut cache = self.dir_cache.lock().await;
        cache.insert(
            path.to_string(),
            DirCacheEntry {
                created_at: Instant::now(),
                entries: entries.clone(),
            },
        );

        Ok(entries)
    }

    async fn read_remote_text_file(&self, path: &str) -> Result<String, TermifError> {
        let command = format!("cat {}", shell_single_quote(path));
        let output = self.exec_capture(&command, None).await?;
        if output.exit_status.unwrap_or(1) != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(TermifError::Internal(if stderr.is_empty() {
                format!("cannot read remote file: {}", path)
            } else {
                stderr
            }));
        }

        Ok(String::from_utf8_lossy(&output.stdout).into_owned())
    }

    async fn write_remote_text_file(&self, path: &str, content: &str) -> Result<(), TermifError> {
        let command = format!("cat > {}", shell_single_quote(path));
        let output = self.exec_capture(&command, Some(content.as_bytes())).await?;
        if output.exit_status.unwrap_or(1) != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(TermifError::Internal(if stderr.is_empty() {
                format!("cannot write remote file: {}", path)
            } else {
                stderr
            }));
        }

        Ok(())
    }

    async fn collect_system_stats(&self) -> Result<SystemStatsDto, TermifError> {
        let output = self.exec_capture(MONITORING_SCRIPT, None).await?;
        if output.exit_status.unwrap_or(1) != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(TermifError::Internal(if stderr.is_empty() {
                "monitoring command failed".to_string()
            } else {
                stderr
            }));
        }

        Ok(parse_system_stats(&String::from_utf8_lossy(&output.stdout)))
    }
}

async fn ssh_channel_loop(
    mut channel: Channel<client::Msg>,
    mut control_rx: tokio::sync::mpsc::UnboundedReceiver<SshControl>,
    pending: Arc<Mutex<Vec<u8>>>,
    push_channel: Arc<Mutex<Option<FrontendChannel<String>>>>,
) {
    loop {
        tokio::select! {
            next_control = control_rx.recv() => {
                match next_control {
                    Some(SshControl::Input(data)) => {
                        let mut writer = channel.make_writer();
                        if writer.write_all(data.as_bytes()).await.is_err() {
                            break;
                        }
                        let _ = writer.flush().await;
                    }
                    Some(SshControl::Resize { cols, rows }) => {
                        if channel.window_change(cols as u32, rows as u32, 0, 0).await.is_err() {
                            break;
                        }
                    }
                    Some(SshControl::Shutdown) | None => {
                        let mut writer = channel.make_writer();
                        let _ = writer.write_all(b"exit\r").await;
                        let _ = writer.flush().await;
                        let _ = channel.eof().await;
                        break;
                    }
                }
            }
            next_msg = channel.wait() => {
                match next_msg {
                    Some(ChannelMsg::Data { data }) => push_output(&pending, &push_channel, &data),
                    Some(ChannelMsg::ExtendedData { data, .. }) => push_output(&pending, &push_channel, &data),
                    Some(ChannelMsg::ExitStatus { .. }) => break,
                    Some(_) => {}
                    None => break,
                }
            }
        }
    }

    let _ = channel.close().await;
}

fn push_output(
    pending: &Arc<Mutex<Vec<u8>>>,
    push_channel: &Arc<Mutex<Option<FrontendChannel<String>>>>,
    bytes: &[u8],
) {
    let ch = push_channel
        .lock()
        .expect("channel lock poisoned")
        .clone();

    if let Some(ch) = ch {
        let text = String::from_utf8_lossy(bytes).into_owned();
        let _ = ch.send(text);
        return;
    }

    let mut lock = pending.lock().expect("pending lock poisoned");
    lock.extend_from_slice(bytes);
    if lock.len() > 4_000_000 {
        let drain = lock.len().saturating_sub(2_500_000);
        lock.drain(0..drain);
    }
}

fn flush_pending_to_channel(pending: &Arc<Mutex<Vec<u8>>>, ch: &FrontendChannel<String>) {
    let buffered = {
        let mut lock = pending.lock().expect("pending lock poisoned");
        if lock.is_empty() {
            None
        } else {
            Some(String::from_utf8_lossy(&std::mem::take(&mut *lock)).into_owned())
        }
    };

    if let Some(data) = buffered {
        let _ = ch.send(data);
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

fn resolve_ssh_user(options: &SshConnectOptions) -> String {
    options
        .user
        .clone()
        .or_else(|| std::env::var("USER").ok())
        .or_else(|| std::env::var("USERNAME").ok())
        .unwrap_or_else(|| "root".to_string())
}

fn resolve_ssh_key_path(options: &SshConnectOptions) -> Result<PathBuf, TermifError> {
    if let Some(identity_file) = &options.identity_file {
        return Ok(expand_home_path(identity_file));
    }

    let home = user_home_dir()?;
    let candidates = [home.join(".ssh").join("id_ed25519"), home.join(".ssh").join("id_rsa")];

    for path in candidates {
        if path.exists() {
            return Ok(path);
        }
    }

    Err(TermifError::Internal(
        "no ssh private key found (set identity_file in host entry or add ~/.ssh/id_ed25519)"
            .to_string(),
    ))
}

fn user_home_dir() -> Result<PathBuf, TermifError> {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map(PathBuf::from)
        .map_err(|e| TermifError::Internal(e.to_string()))
}

fn expand_home_path(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = user_home_dir() {
            return home.join(rest);
        }
    }

    PathBuf::from(path)
}

fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn parse_ls_output(text: &str, base_path: &str) -> Result<Vec<FileEntryDto>, TermifError> {
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

        let (modified_unix, name) = if parts[5].chars().all(|c| c.is_ascii_digit()) && parts[5].len() >= 9 {
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

fn parse_system_stats(output: &str) -> SystemStatsDto {
    let sections: Vec<&str> = output.split(REACH_SEP).collect();
    let cpu_section = sections.first().copied().unwrap_or_default();
    let meminfo_section = sections.get(1).copied().unwrap_or_default();
    let disk_section = sections.get(2).copied().unwrap_or_default();
    let users_section = sections.get(3).copied().unwrap_or_default();

    SystemStatsDto {
        cpu: parse_cpu_percent(cpu_section),
        ram: parse_ram_percent(meminfo_section),
        disk: parse_disk_percent(disk_section),
        users: parse_users_count(users_section),
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

fn parse_users_count(users_section: &str) -> Option<u32> {
    Some(
        users_section
            .lines()
            .filter(|line| !line.trim().is_empty())
            .count() as u32,
    )
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
