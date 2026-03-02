use crate::models::{RemoteGitConfig, RemoteRulesUploadResult};
use chrono::{DateTime, Utc};
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::process::Command;
use url::Url;

const REMOTE_RULES_FILE_PATH: &str = "groups-rules-backup.json";

struct TempRepoGuard {
    path: PathBuf,
}

impl TempRepoGuard {
    fn new(path: PathBuf) -> Result<Self, String> {
        if path.exists() {
            std::fs::remove_dir_all(&path)
                .map_err(|e| format!("cleanup previous temp repo failed: {e}"))?;
        }
        std::fs::create_dir_all(&path).map_err(|e| format!("create temp repo failed: {e}"))?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempRepoGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.path);
    }
}

fn run_git(cwd: &Path, args: &[&str], context: &str) -> Result<String, String> {
    let output = git_command(cwd, args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| format!("{context}: {e}"))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        return Err(format!("{context}: exit status {}", output.status));
    }
    Err(format!("{context}: {stderr}"))
}

fn run_git_status(cwd: &Path, args: &[&str], context: &str) -> Result<std::process::ExitStatus, String> {
    git_command(cwd, args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .status()
        .map_err(|e| format!("{context}: {e}"))
}

fn git_command(cwd: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::new("git");
    cmd.current_dir(cwd).args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn authenticated_repo_url(repo_url: &str, token: &str) -> Result<String, String> {
    let mut url = Url::parse(repo_url).map_err(|_| "remoteGit.repoUrl must be a valid URL".to_string())?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("remoteGit.repoUrl must use http or https".to_string());
    }
    if token.trim().is_empty() {
        return Err("remoteGit.token cannot be empty".to_string());
    }

    let username = if url.host_str() == Some("github.com") {
        "x-access-token"
    } else {
        "oauth2"
    };
    url.set_username(username)
        .map_err(|_| "failed to set auth username".to_string())?;
    url.set_password(Some(token))
        .map_err(|_| "failed to set auth token".to_string())?;
    Ok(url.to_string())
}

fn require_remote_ready(remote: &RemoteGitConfig) -> Result<(), String> {
    if remote.repo_url.trim().is_empty() || remote.token.trim().is_empty() {
        return Err("Please configure remote repository info first".to_string());
    }
    if remote.branch.trim().is_empty() {
        return Err("remoteGit.branch cannot be empty".to_string());
    }
    Ok(())
}

fn init_repo(tmp_repo: &Path, auth_repo_url: &str) -> Result<(), String> {
    run_git(tmp_repo, &["init", "-q"], "git init failed")?;
    run_git(tmp_repo, &["config", "user.name", "AI Open Router"], "git config user.name failed")?;
    run_git(tmp_repo, &["config", "user.email", "aor@local"], "git config user.email failed")?;
    run_git(tmp_repo, &["remote", "add", "origin", auth_repo_url], "git remote add failed")?;
    Ok(())
}

fn checkout_branch(tmp_repo: &Path, branch: &str, create_if_missing: bool) -> Result<bool, String> {
    let fetch_args = ["fetch", "--depth", "1", "origin", branch];
    let fetched = run_git(tmp_repo, &fetch_args, "git fetch failed").is_ok();

    if fetched {
        run_git(
            tmp_repo,
            &["checkout", "-B", branch, "FETCH_HEAD"],
            "git checkout branch failed",
        )?;
        return Ok(true);
    }

    if !create_if_missing {
        return Ok(false);
    }

    run_git(
        tmp_repo,
        &["checkout", "--orphan", branch],
        "git checkout orphan branch failed",
    )?;
    let _ = run_git(tmp_repo, &["reset", "--hard"], "git reset temp repo failed");
    Ok(false)
}

fn write_remote_rules_file(tmp_repo: &Path, json_text: &str) -> Result<PathBuf, String> {
    let output_file = tmp_repo.join(REMOTE_RULES_FILE_PATH);
    if let Some(parent) = output_file.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create remote file parent failed: {e}"))?;
    }
    std::fs::write(&output_file, json_text).map_err(|e| format!("write remote rules file failed: {e}"))?;
    Ok(output_file)
}

pub fn pull_groups_json_from_remote(app_data_dir: &Path, remote: &RemoteGitConfig) -> Result<String, String> {
    require_remote_ready(remote)?;
    let auth_repo_url = authenticated_repo_url(&remote.repo_url, &remote.token)?;
    let tmp_repo = TempRepoGuard::new(app_data_dir.join("remote-sync-tmp"))?;

    init_repo(tmp_repo.path(), &auth_repo_url)?;
    let found = checkout_branch(tmp_repo.path(), remote.branch.trim(), false)?;
    if !found {
        return Err(format!("Remote branch not found: {}", remote.branch.trim()));
    }

    let content = std::fs::read_to_string(tmp_repo.path().join(REMOTE_RULES_FILE_PATH))
        .map_err(|e| format!("read remote rules file failed: {e}"))?;
    Ok(content)
}

pub fn upload_groups_json_to_remote(
    app_data_dir: &Path,
    remote: &RemoteGitConfig,
    json_text: &str,
    group_count: usize,
    local_updated_at: Option<String>,
    force: bool,
) -> Result<RemoteRulesUploadResult, String> {
    require_remote_ready(remote)?;
    let branch = remote.branch.trim().to_string();
    let auth_repo_url = authenticated_repo_url(&remote.repo_url, &remote.token)?;
    let tmp_repo = TempRepoGuard::new(app_data_dir.join("remote-sync-tmp"))?;

    init_repo(tmp_repo.path(), &auth_repo_url)?;
    let found_branch = checkout_branch(tmp_repo.path(), &branch, true)?;

    let remote_updated_at = if found_branch {
        read_remote_exported_at(tmp_repo.path()).ok().flatten()
    } else {
        None
    };

    if !force && is_local_older(local_updated_at.as_deref(), remote_updated_at.as_deref()) {
        return Ok(RemoteRulesUploadResult {
            ok: true,
            changed: false,
            branch,
            file_path: REMOTE_RULES_FILE_PATH.to_string(),
            group_count,
            needs_confirmation: true,
            warning: Some("remote_newer_than_local".to_string()),
            local_updated_at,
            remote_updated_at,
        });
    }

    let _ = write_remote_rules_file(tmp_repo.path(), json_text)?;

    run_git(
        tmp_repo.path(),
        &["add", REMOTE_RULES_FILE_PATH],
        "git add remote rules file failed",
    )?;
    let diff_status = run_git_status(
        tmp_repo.path(),
        &["diff", "--cached", "--quiet"],
        "git diff check failed",
    )?;
    let changed = match diff_status.code() {
        Some(0) => false,
        Some(1) => true,
        _ => return Err("git diff check failed with unexpected exit status".to_string()),
    };

    if changed {
        run_git(
            tmp_repo.path(),
            &["commit", "-m", "chore: sync groups and rules from AI Open Router"],
            "git commit failed",
        )?;
        run_git(
            tmp_repo.path(),
            &["push", "-u", "origin", &branch],
            "git push failed",
        )?;
    }

    Ok(RemoteRulesUploadResult {
        ok: true,
        changed,
        branch,
        file_path: REMOTE_RULES_FILE_PATH.to_string(),
        group_count,
        needs_confirmation: false,
        warning: None,
        local_updated_at,
        remote_updated_at,
    })
}

pub fn remote_rules_file_path() -> &'static str {
    REMOTE_RULES_FILE_PATH
}

pub fn has_remote_git_binary() -> bool {
    let mut cmd = Command::new("git");
    cmd.arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

pub fn read_remote_exported_at(repo_root: &Path) -> Result<Option<String>, String> {
    let file = repo_root.join(REMOTE_RULES_FILE_PATH);
    if !file.exists() {
        return Ok(None);
    }
    let raw = std::fs::read_to_string(file).map_err(|e| format!("read remote rules file failed: {e}"))?;
    let parsed = serde_json::from_str::<Value>(&raw).map_err(|e| format!("parse remote rules file failed: {e}"))?;
    Ok(parsed
        .get("exportedAt")
        .and_then(|v| v.as_str())
        .map(|v| v.to_string()))
}

fn parse_ts(ts: &str) -> Option<DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(ts)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn is_local_older(local: Option<&str>, remote: Option<&str>) -> bool {
    match (local.and_then(parse_ts), remote.and_then(parse_ts)) {
        (Some(local_dt), Some(remote_dt)) => local_dt < remote_dt,
        _ => false,
    }
}
