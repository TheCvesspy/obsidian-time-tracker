# Time Tracker for Obsidian

A time tracking plugin for Obsidian that helps you stay on top of your hours. Start a timer, pause and resume, get nudged when you forget, quickly log entries, and review your day, week, or month — all from within Obsidian.

## Features

### Status Bar Timer
A compact timer lives in your status bar. When running, it shows elapsed time and current task with a pulsing green indicator. When idle, it shows today's total tracked hours. Click for actions: start, pause, resume, or stop.

### Timer Pause/Resume
Need a break? Pause the timer instead of stopping it. The elapsed time freezes, and you can resume when ready. The status bar shows a yellow indicator and pause icon while paused. Toggle Timer cycles through: idle → start, running → pause, paused → resume.

### Quick Logging
Two ways to capture time:
- **Timer mode** — start a timer, work, stop it. Entry is saved automatically.
- **Log Time** — manually log a past entry with start time, end time, and description.

### Edit & Delete Entries
Made a mistake? Use the **Edit Time Entry** command to browse entries by date, then edit any field (times, description, category) or delete an entry entirely. Changes are written directly to the markdown table with the total recalculated automatically.

### Midnight Crossing
If a timer runs past midnight, it's automatically split into two entries — one for each day. Daily totals stay accurate.

### Daily & Weekly Summaries
- **Daily Summary** — see today's (or any day's) total hours, entry list, and category breakdown with bar chart visualization. Navigate between days.
- **Weekly Summary** — total hours per day, category breakdown, average per day. Copy as markdown or insert directly into a note. Navigate between weeks.
- **Monthly Summary** — toggle to monthly view in the Weekly Summary modal for a full month overview with the same visualizations and export options.

### Idle Nudges
The plugin reminds you to track your time when no timer is running. Configurable interval (default: every 30 minutes). Because the whole point is to not forget.

### Active Timer Reminders
Optional notifications while a timer is running — either at regular intervals or at specific scheduled times throughout the day.

### Categories
Define project categories (e.g., "Deep Work", "Meetings", "Admin") that appear as autocomplete suggestions when logging time. Free-text entry is also supported. New categories you type are automatically learned and added to the suggestion list.

### Daily Notes Integration
The plugin detects your daily note setup with this priority:
1. **BuJo Task Manager** — if installed and enabled, entries go into BuJo daily notes
2. **Obsidian Daily Notes** — if the core Daily Notes plugin is enabled, entries go there (respects your folder and date format settings)
3. **Standalone** — creates its own daily notes at a configurable path

## Time Entry Format

Entries are stored as standard markdown tables in daily notes:

```markdown
## Time Log

| Start | End | Duration | Description |
|-------|-----|----------|-------------|
| 09:00 | 10:30 | 1.5h | Deep Work - Implement login |
| 10:30 | 11:00 | 0.5h | Review - PR #42 |
| | | **2.0h** | **Total** |
```

Everything stays in plain markdown. No proprietary formats, no lock-in.

## Commands

| Command | Description |
|---------|-------------|
| **Start Timer** | Open modal to start tracking a task |
| **Stop Timer** | Stop the running timer and save the entry |
| **Pause Timer** | Pause the running timer (preserves elapsed time) |
| **Resume Timer** | Resume a paused timer |
| **Toggle Timer** | Cycle: idle → start, running → pause, paused → resume |
| **Log Time** | Manually log a past time entry |
| **Edit Time Entry** | Edit or delete entries for any date |
| **Daily Summary** | View today's summary with navigation |
| **Weekly Summary** | Open the weekly/monthly report modal |
| **Open Today's Time Log** | Navigate to today's daily note |

All commands are available from the command palette (`Ctrl/Cmd + P`). You can assign keyboard shortcuts in Obsidian's Hotkeys settings.

## Settings

### Integration
- **BuJo integration** — toggle on/off; auto-detects BuJo's daily note path
- **BuJo path override** — manually set the path if auto-detect doesn't work
- **Obsidian Daily Notes integration** — toggle on/off; auto-detects folder and date format from the core plugin
- **Standalone daily note path** — where to store notes when neither integration is active (default: `TimeTracking/Daily`)
- **Time log section heading** — customize the markdown heading (default: `## Time Log`)

### Categories
- **Project categories** — comma-separated list of category suggestions (auto-learns new categories)
- **Allow free-text** — type any category, not just predefined ones

### Timer Display
- **Show status bar widget** — toggle the status bar timer on/off
- **Show seconds** — display seconds in elapsed time
- **Time format** — 24-hour or 12-hour

### Reminders
- **Idle nudges** — enable/disable, interval, custom message
- **Active reminders** — off, interval, or scheduled times; custom message with `{elapsed}` and `{task}` placeholders

### Reports
- **Week start day** — Sunday through Saturday

## Installation

### Manual Install
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest release (or run `node release.mjs` to build them)
2. Create a folder in your vault: `.obsidian/plugins/obsidian-time-tracker/`
3. Copy the three files into that folder
4. Restart Obsidian or reload plugins
5. Enable "Time Tracker" in Settings → Community Plugins

### From Source
```bash
git clone <repo-url>
cd "Obsidian Time Tracker"
npm install
npm run build
```

Then copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder.

## Development

```bash
npm run dev     # Watch mode with hot reload
npm run build   # Production build with type checking
node release.mjs # Build + package into _release/
```

### Project Structure
```
src/
  main.ts           — Plugin entry point
  types.ts          — TypeScript interfaces and defaults
  constants.ts      — Regex patterns, table templates
  settings.ts       — Settings UI
  utils.ts          — Shared date/time utilities
  services/         — Core business logic
  ui/               — Modal and widget components
```

See [agents.md](agents.md) for detailed architecture documentation.

## Design Principles

- **Everything in markdown** — no binary state, no database. All time entries are readable, editable, and portable.
- **Configurable over hardcoded** — sensible defaults, but nothing is locked in.
- **Non-destructive** — only writes within the `## Time Log` section. Never touches your other content. Safe to uninstall at any time.
- **Integration-aware** — detects BuJo and Obsidian Daily Notes automatically, works standalone when neither is present.

## License

MIT
