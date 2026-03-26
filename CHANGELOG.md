# Changelog

## 0.2.4

### Added

- **Stop/start control** — press `s` to stop the selected workspace process, or start it again if already stopped.
- **Restart control** — press `r` to restart the selected workspace process.
- **Resource metrics** — pass `--metrics` to display per-process CPU and memory usage columns in the dashboard. Polls every 3 seconds with color-coded thresholds (memory yellow >256 M, red >512 M; CPU red >80%).
