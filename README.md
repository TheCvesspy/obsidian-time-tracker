# Time Tracker for Obsidian

A time tracking plugin for Obsidian that helps you stay on top of your hours. Start a timer, get nudged when you forget, quickly log time, and review your work with rich reports — all from within Obsidian.

## Features

### Status Bar Timer
A compact timer lives in your status bar. When running, it shows elapsed time and current task with a pulsing green indicator. When idle, it shows today's total logged hours — and when daily goals are enabled, it shows progress toward your goal (e.g., `5.5h / 8h`) with color indicators: muted when far, yellow when close (75%+), green when reached. Click for a context menu with quick actions: start/stop timer, daily summary, edit logs, heatmap, and trend charts.

### Quick Logging
Two ways to capture time:
- **Timer mode** — start a timer, work, stop it. Time log is saved automatically.
- **Manual mode** — quickly log a past time block with start time, end time, and description.

### Edit & Delete Logs
Open the Edit Time Log modal to view, modify, or delete any existing time log for any date. Changes are written back to the daily note markdown.

### Daily Summary
View a summary of today's tracked time — total hours, per-log breakdown, and category split. When daily goals are enabled, a progress bar shows how close you are to your target.

### Idle Nudges
The plugin reminds you to track your time when no timer is running. Configurable interval (default: every 30 minutes). Because the whole point is to not forget.

### Active Timer Reminders
Optional notifications while a timer is running — either at regular intervals or at specific scheduled times throughout the day.

### Categories
Define project categories that appear as autocomplete suggestions when logging time. Default categories are tailored for analyst/management roles: Meetings, Ceremonies, Analysis, Research, Testing, Review, Management, Admin, and Learning. Free-text entry is also supported — customize the list in settings to match your workflow.

### Weekly Summary
A built-in report showing:
- Total hours per day with bar chart visualization
- Category breakdown with percentages
- Copy as markdown or insert directly into a note

### Date Range Reports
Generate reports for custom date ranges with preset buttons for last 7 days, 30 days, and quarterly periods. Shows daily breakdown, category split, and active day count. Copy or insert as markdown.

### Calendar Heatmap
A GitHub-style activity heatmap showing your time tracking activity over 3 months, 6 months, or a full year. Includes stats for total hours, average per work day, current streak, longest streak, and most productive day of the week. Weekends and holidays are visually distinguished with a diagonal stripe pattern. Configurable color schemes (green, blue, purple, or theme accent).

When "Exclude non-working days" is enabled, streaks skip weekends and holidays — a Friday-to-Monday streak isn't broken by a weekend off.

### Trend Charts
Two chart views for visualizing patterns:
- **Hours over time** — line chart of daily hours with optional goal line and a 5-day moving average for spotting trends. Toggle "Workdays only" to remove weekend dips; when showing all days, weekends are shaded for context.
- **Category trends** — weekly stacked area chart showing how your time splits across categories

### Template Tasks
Pre-configure common tasks (with name, description, and category) for one-click timer start. Ideal for recurring activities like standups, deep work blocks, or admin time.

### Daily Goals
Set a target number of hours per day. When enabled, the status bar shows goal progress with color indicators, the daily summary shows a progress bar, and the calendar heatmap uses goal-relative scaling with overtime indication.

### Work Days & Holidays
Designed for work time tracking (Mon–Fri). When "Exclude non-working days" is enabled:
- Weekends and holidays don't break streaks
- Averages are computed over work days only
- Trend charts can filter to workdays only

Manage holidays via a dedicated modal with year-based navigation. Add holidays individually or bulk-import by pasting a list (one per line, format: `YYYY-MM-DD Holiday Name`). Holiday data persists across years for accurate long-term trends.

### Time Rounding
Optionally round end times to the nearest 5, 15, or 30 minutes when editing time logs.

### BuJo Integration
If the [BuJo Task Manager](https://github.com/) plugin is installed, time logs are added to BuJo's daily notes under a `## Time Log` section. If BuJo isn't present, the plugin creates its own daily notes.

## Time Log Format

Time logs are stored as standard markdown tables in daily notes:

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
| **Stop Timer** | Stop the running timer and save the time log |
| **Toggle Timer** | Start or stop — ideal for a keyboard shortcut |
| **Quick Log** | Manually log a past time block |
| **Weekly Summary** | Open the weekly report modal |
| **Open Today's Time Log** | Navigate to today's daily note |
| **Daily Summary** | View today's summary with goal progress |
| **Edit Time Log** | Edit or delete existing time logs |
| **Date Range Report** | Generate report for a custom date range |
| **Calendar Heatmap** | View GitHub-style activity heatmap |
| **Trend Charts** | View hours and category trend charts |
| **Start Timer from Template** | Quick-start timer from a saved template |

All commands are available from the command palette (`Ctrl/Cmd + P`). You can assign keyboard shortcuts in Obsidian's Hotkeys settings.

## Settings

### Integration
- **BuJo integration** — toggle on/off; auto-detects BuJo's daily note path
- **BuJo path override** — manually set the path if auto-detect doesn't work
- **Standalone daily note path** — where to store notes when BuJo isn't present (default: `TimeTracking/Daily`)
- **Time log section heading** — customize the markdown heading (default: `## Time Log`)

### Categories
- **Project categories** — comma-separated list of category suggestions (default: Meetings, Ceremonies, Analysis, Research, Testing, Review, Management, Admin, Learning)
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

### Work Days & Holidays
- **Exclude non-working days** — weekends/holidays won't break streaks or affect averages
- **Manage Holidays** — opens a modal to add, import, or remove holidays by year

### Goals
- **Enable daily goals** — toggle goal tracking on/off
- **Daily goal (hours)** — target number of hours per day (default: 8)

### Appearance
- **Heatmap color scheme** — green, blue, purple, or theme accent

### Time Rounding
- **Rounding mode** — none, 5 minutes, 15 minutes, or 30 minutes

### Template Tasks
- **Quick-start templates** — JSON array of template tasks, each with name, description, and category

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
  settings.ts       — Settings UI (10 sections)
  utils.ts          — Shared date/time utilities
  services/         — Core business logic
  ui/               — Modal and widget components
    charts/         — Heatmap and chart renderers
```

See [agents.md](agents.md) for detailed architecture documentation.

## Design Principles

- **Everything in markdown** — no binary state, no database. All time logs are readable, editable, and portable.
- **Configurable over hardcoded** — 22 settings covering every behavior. Sensible defaults, but nothing is locked in.
- **Non-destructive** — only writes within the `## Time Log` section. Never touches your other content. Safe to uninstall at any time.
- **BuJo-aware** — integrates with the BuJo Task Manager when present, works standalone when not.

## License

MIT
