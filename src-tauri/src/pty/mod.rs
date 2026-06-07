mod parsers;

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

use self::parsers::{parse_ls_output, parse_system_stats, shell_single_quote};
use crate::core::{
    errors::TermifError,
    models::{FileEntryDto, SessionDto, SessionKind, SystemStatsDto},
};
use crate::platform;

const DIR_CACHE_TTL: Duration = Duration::from_millis(1_500);
const MONITORING_SCRIPT: &str = "grep '^cpu ' /proc/stat 2>/dev/null; sleep 0.5; grep '^cpu ' /proc/stat 2>/dev/null; echo '===REACH_SEP==='; cat /proc/meminfo; echo '===REACH_SEP==='; df -P /; echo '===REACH_SEP==='; w -hs || who; echo '===REACH_SEP==='; date '+%s %Z' 2>/dev/null || date +%s 2>/dev/null";
#[derive(Clone, Debug)]
pub struct SshConnectOptions {
    pub alias: String,
    pub host: String,
    pub user: Option<String>,
    pub port: u16,
    pub identity_file: Option<String>,
    pub password: Option<String>,
    pub connect_timeout_seconds: u16,
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
        thread::spawn(move || loop {
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

    pub fn attach_channel(
        &self,
        session_id: &str,
        ch: FrontendChannel<String>,
    ) -> Result<(), TermifError> {
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
                let client = Arc::clone(&ssh.client);
                tauri::async_runtime::spawn(async move {
                    client.disconnect().await;
                });
            }
        }

        Ok(())
    }

    pub fn close_all_sessions(&self) {
        let runtimes = {
            let mut sessions = self.sessions.lock().expect("sessions lock poisoned");
            sessions
                .drain()
                .map(|(_, runtime)| runtime)
                .collect::<Vec<_>>()
        };

        for runtime in runtimes {
            match runtime {
                SessionRuntime::Local(local) => {
                    let _ = local.control_tx.send(LocalControl::Shutdown);
                }
                SessionRuntime::Ssh(ssh) => {
                    let _ = ssh.control_tx.send(SshControl::Shutdown);
                    let client = Arc::clone(&ssh.client);
                    tauri::async_runtime::spawn(async move {
                        client.disconnect().await;
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

    pub async fn create_remote_fs_entry(
        &self,
        session_id: &str,
        path: &str,
        is_dir: bool,
    ) -> Result<(), TermifError> {
        let client = self.ssh_client(session_id)?;
        client.create_remote_fs_entry(path, is_dir).await
    }

    pub async fn delete_remote_fs_entry(
        &self,
        session_id: &str,
        path: &str,
        is_dir: bool,
    ) -> Result<(), TermifError> {
        let client = self.ssh_client(session_id)?;
        client.delete_remote_fs_entry(path, is_dir).await
    }

    pub async fn rename_remote_fs_entry(
        &self,
        session_id: &str,
        from: &str,
        to: &str,
    ) -> Result<(), TermifError> {
        let client = self.ssh_client(session_id)?;
        client.rename_remote_fs_entry(from, to).await
    }

    pub async fn fetch_system_stats(
        &self,
        session_id: &str,
    ) -> Result<SystemStatsDto, TermifError> {
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
    async fn disconnect(&self) {
        let _ = self
            .handle
            .disconnect(Disconnect::ByApplication, "", "English")
            .await;
    }

    async fn connect(options: &SshConnectOptions) -> Result<Self, TermifError> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(u64::from(
                options.connect_timeout_seconds.max(10),
            ))),
            ..Default::default()
        });

        let mut handle = client::connect(config, (options.host.as_str(), options.port), SshHandler)
            .await
            .map_err(|e| TermifError::Internal(e.to_string()))?;

        let user = resolve_ssh_user(options);
        if let Some(password) = options
            .password
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            let auth = handle
                .authenticate_password(user.clone(), password.to_string())
                .await
                .map_err(|e| TermifError::Internal(e.to_string()))?;

            if auth.success() {
                return Ok(Self {
                    handle,
                    dir_cache: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
                });
            }
        }

        let key_path = resolve_ssh_key_path(options)?;
        let key_pair = load_secret_key(&key_path, None).map_err(|e| {
            TermifError::Internal(format!(
                "failed to load ssh key {}: {}",
                key_path.display(),
                e
            ))
        })?;

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
                "ssh authentication failed (password/key rejected)".to_string(),
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
        let output = self
            .exec_capture(&command, Some(content.as_bytes()))
            .await?;
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

    async fn create_remote_fs_entry(&self, path: &str, is_dir: bool) -> Result<(), TermifError> {
        let command = if is_dir {
            format!("mkdir -p {}", shell_single_quote(path))
        } else {
            format!("touch {}", shell_single_quote(path))
        };
        let output = self.exec_capture(&command, None).await?;
        if output.exit_status.unwrap_or(1) != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(TermifError::Internal(if stderr.is_empty() {
                format!("cannot create remote entry: {}", path)
            } else {
                stderr
            }));
        }
        Ok(())
    }

    async fn delete_remote_fs_entry(&self, path: &str, is_dir: bool) -> Result<(), TermifError> {
        let command = if is_dir {
            format!("rm -rf {}", shell_single_quote(path))
        } else {
            format!("rm -f {}", shell_single_quote(path))
        };
        let output = self.exec_capture(&command, None).await?;
        if output.exit_status.unwrap_or(1) != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(TermifError::Internal(if stderr.is_empty() {
                format!("cannot delete remote entry: {}", path)
            } else {
                stderr
            }));
        }
        Ok(())
    }

    async fn rename_remote_fs_entry(&self, from: &str, to: &str) -> Result<(), TermifError> {
        let command = format!("mv {} {}", shell_single_quote(from), shell_single_quote(to));
        let output = self.exec_capture(&command, None).await?;
        if output.exit_status.unwrap_or(1) != 0 {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(TermifError::Internal(if stderr.is_empty() {
                format!("cannot rename: {} -> {}", from, to)
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
    let ch = push_channel.lock().expect("channel lock poisoned").clone();

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
    resolve_local_shell_for_platform(
        shell_profile
            .unwrap_or_else(|| platform::default_shell_profile().to_string())
            .to_lowercase(),
    )
}

#[cfg(target_os = "windows")]
fn resolve_local_shell_for_platform(shell_profile: String) -> (String, Vec<String>, String) {
    match shell_profile.to_lowercase().as_str() {
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

#[cfg(not(target_os = "windows"))]
fn resolve_local_shell_for_platform(shell_profile: String) -> (String, Vec<String>, String) {
    match shell_profile.as_str() {
        "pwsh" | "powershell7" => (
            "pwsh".to_string(),
            vec!["-NoLogo".to_string()],
            "PowerShell 7".to_string(),
        ),
        "fish" => ("fish".to_string(), vec![], "Fish".to_string()),
        "sh" => ("sh".to_string(), vec![], "Sh".to_string()),
        "bash" => (
            "bash".to_string(),
            vec!["-l".to_string()],
            "Bash".to_string(),
        ),
        "zsh" => ("zsh".to_string(), vec!["-l".to_string()], "Zsh".to_string()),
        _ => {
            if let Ok(shell) = std::env::var("SHELL") {
                let title = PathBuf::from(&shell)
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(title_case_shell)
                    .unwrap_or_else(|| "Shell".to_string());
                return (shell, vec!["-l".to_string()], title);
            }

            #[cfg(target_os = "macos")]
            {
                ("zsh".to_string(), vec!["-l".to_string()], "Zsh".to_string())
            }

            #[cfg(all(unix, not(target_os = "macos")))]
            {
                (
                    "bash".to_string(),
                    vec!["-l".to_string()],
                    "Bash".to_string(),
                )
            }
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn title_case_shell(name: &str) -> String {
    match name {
        "zsh" => "Zsh".to_string(),
        "bash" => "Bash".to_string(),
        "fish" => "Fish".to_string(),
        "sh" => "Sh".to_string(),
        "pwsh" => "PowerShell 7".to_string(),
        other => other.to_string(),
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
        let trimmed = identity_file.trim();
        if trimmed.is_empty() {
            return Err(TermifError::Internal("identity_file is empty".to_string()));
        }

        if !trimmed.contains('/') && !trimmed.contains('\\') && !trimmed.contains(':') {
            let home = user_home_dir()?;
            return Ok(home.join(".ssh").join(trimmed));
        }

        return Ok(expand_home_path(identity_file));
    }

    let home = user_home_dir()?;
    let candidates = [
        home.join(".ssh").join("id_ed25519"),
        home.join(".ssh").join("id_rsa"),
    ];

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
    platform::home_dir()
}

fn expand_home_path(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Ok(home) = user_home_dir() {
            return home.join(rest);
        }
    }

    PathBuf::from(path)
}
