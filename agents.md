# Obsidian Time Tracker — Agent Reference

This document describes the plugin's architecture, file structure, and all public APIs for agents or developers working on the codebase.

## Plugin Identity

- **ID:** `obsidian-time-tracker`
- **Entry point:** `src/main.ts` → `TimeTrackerPlugin` (extends Obsidian `Plugin`)
- **Build:** `npm run build` (TypeScript typecheck + esbuild bundle → `main.js`)
- **Dev mode:** `npm run dev` (esbuild watch mode with inline sourcemaps)
- **Release:** `node release.mjs` (builds + copies `main.js`, `manifest.json`, `styles.css` to `_release/`)

## Architecture Overview

```
TimeTrackerPlugin (main.ts)
├── DailyNoteIntegration (services/)  — resolves daily note paths, BuJo detection
├── TimerService (services/)          — running timer state machine + persistence
├── TimeEntryService (services/)      — CRUD for markdown table entries
├── ReminderService (services/)       — idle nudges + active timer notifications
├── ReportService (services/)         — daily/weekly/date-range summary computation
├── StatusBarWidget (ui/)             — status bar timer display + goal progress + context menu
├── TimerModal (ui/)                  — modal for starting a timer
├── QuickLogModal (ui/)               — modal for manual time log
├── WeeklySummaryModal (ui/)          — modal for weekly report view
├── DailySummaryModal (ui/)           — modal for daily summary with goal progress
├── EditEntryModal (ui/)              — modal for editing/deleting existing time logs
├── DateRangeReportModal (ui/)        — modal for custom date range reports
├── CalendarHeatmapModal (ui/)        — modal for GitHub-style activity heatmap (work-day aware)
├── TrendChartsModal (ui/)            — modal for hours and category trend charts (workday filter + moving avg)
├── HolidayManagerModal (ui/)         — modal for year-based holiday management with bulk import
├── TemplatePickerModal (ui/)         — suggest modal for quick-start from templates
├── CategorySuggest (ui/)             — datalist autocomplete for categories
├── HeatmapRenderer (ui/charts/)      — SVG heatmap rendering + tooltip + non-working-day patterns
├── ChartRenderer (ui/charts/)        — line chart + stacked area chart rendering + moving avg style
└── TimeTrackerSettingTab (settings.ts) — plugin settings UI (10 sections)
```

## File Structure

```
src/
  main.ts              — Plugin lifecycle, command registration, service wiring
  types.ts             — All interfaces, enums, defaults (TimeEntry, TimerState, PluginSettings, etc.)
  constants.ts         — Regex patterns, plugin IDs, table templates
  settings.ts          — PluginSettingTab with 10 sections
  utils.ts             — Shared date/time utilities (formatDateISO, parseDate, roundEndTime, etc.)
  services/
    DailyNoteIntegration.ts  — BuJo detection, daily note path resolution, section management
    TimerService.ts          — Timer start/stop, elapsed time, persistence across restarts
    TimeEntryService.ts      — Add/update/delete/read time logs in markdown tables
    ReminderService.ts       — Idle nudges + active timer reminders (interval & schedule)
    ReportService.ts         — Daily/weekly/date-range summary computation, markdown export
  ui/
    StatusBarWidget.ts       — Status bar element with pulsing dot, context menu
    TimerModal.ts            — Start timer modal (description + category)
    QuickLogModal.ts         — Manual log modal (date, start, end, description, category)
    WeeklySummaryModal.ts    — Weekly report modal with bar charts
    DailySummaryModal.ts     — Daily summary modal with goal progress bar
    EditEntryModal.ts        — Edit/delete time logs modal (two-phase: list → edit form)
    DateRangeReportModal.ts  — Custom date range report with presets (7d, 30d, quarters)
    CalendarHeatmapModal.ts  — GitHub-style heatmap (3m/6m/1y) with stats
    TrendChartsModal.ts      — Line chart (hours/day) + stacked area chart (categories)
    HolidayManagerModal.ts   — Year-based holiday management with bulk import
    TemplatePickerModal.ts   — SuggestModal for picking template tasks
    CategorySuggest.ts       — HTML datalist-based category autocomplete
    charts/
      HeatmapRenderer.ts    — SVG calendar heatmap with tooltips and legends
      ChartRenderer.ts       — SVG line chart, stacked area chart, palette generation
```

## Key Types (src/types.ts)

### TimeEntry
```typescript
interface TimeEntry {
  id: string;                    // "${date}:${startTime}"
  date: string;                  // YYYY-MM-DD
  startTime: string;             // HH:MM (24h)
  endTime: string | null;        // HH:MM or null if running
  durationHours: number | null;  // computed decimal hours
  description: string;
  category: string | null;
}
```

### TimerState (persisted across restarts)
```typescript
interface TimerState {
  isRunning: boolean;
  startedAt: string | null;      // ISO timestamp
  currentDescription: string;
  currentCategory: string | null;
}
```

### Holiday
```typescript
interface Holiday {
  date: string;   // YYYY-MM-DD
  name: string;   // e.g., "Christmas Day"
}
```

### PluginSettings (24 configurable options)
```typescript
interface PluginSettings {
  standaloneDailyNotePath: string;       // default: 'TimeTracking/Daily'
  enableBuJoIntegration: boolean;        // default: true
  buJoDailyNotePathOverride: string;     // default: '' (auto-detect)
  timeLogHeading: string;                // default: '## Time Log'
  categories: string[];                  // default: ['Meetings', 'Ceremonies', 'Analysis', 'Research', 'Testing', 'Review', 'Management', 'Admin', 'Learning']
  allowFreeTextCategories: boolean;      // default: true
  reminderMode: ReminderMode;            // default: Off
  reminderIntervalMinutes: number;       // default: 30
  reminderScheduledTimes: string[];      // default: ['09:00', '12:00', '15:00', '17:00']
  reminderMessage: string;               // default: 'Time check: {elapsed} on "{task}"'
  enableIdleReminders: boolean;          // default: true
  idleReminderIntervalMinutes: number;   // default: 30
  idleReminderMessage: string;           // default: 'Are you tracking your time?...'
  showSeconds: boolean;                  // default: false
  timeFormat: '24h' | '12h';            // default: '24h'
  weekStartDay: number;                  // default: 1 (Monday)
  showStatusBar: boolean;                // default: true
  enableGoals: boolean;                  // default: false
  dailyGoalHours: number;               // default: 8
  heatmapColorScheme: HeatmapColorScheme; // default: 'green'
  roundingMode: string;                  // default: 'none' ('none' | '5min' | '15min' | '30min')
  templateTasks: TemplateTask[];         // default: []
  holidays: Holiday[];                   // default: []
  excludeNonWorkingDays: boolean;        // default: true
}
```

### ReminderMode
```typescript
enum ReminderMode { Interval = 'interval', Schedule = 'schedule', Off = 'off' }
```

### Report & Feature Types
```typescript
interface DailySummary { date, entries, totalHours, byCategory }
interface WeeklySummary { weekStart, weekEnd, days, totalHours, byCategory }
interface DateRangeSummary { startDate, endDate, days, totalHours, byCategory }
interface TemplateTask { name, description, category }
type HeatmapColorScheme = 'green' | 'blue' | 'purple' | 'accent'
const HEATMAP_COLOR_SCHEMES: Record<HeatmapColorScheme, { colors: string[], overtime: string }>
```

## Service APIs

### DailyNoteIntegration
| Method | Description |
|--------|-------------|
| `isBuJoAvailable(): boolean` | Check if BuJo plugin is installed and integration enabled |
| `getBuJoDailyNotePath(): string` | Get BuJo's daily note folder path (auto-detect or override) |
| `getDailyNotePath(date: Date): string` | Get full file path for a date's daily note |
| `getOrCreateDailyNote(date: Date): Promise<TFile>` | Get or create daily note, ensures Time Log section exists |
| `ensureTimeLogSection(file: TFile): Promise<void>` | Append Time Log heading to file if missing |
| `findTimeLogSection(content: string): {start, end} \| null` | Find section boundaries in file content |

### TimerService
| Method | Description |
|--------|-------------|
| `isRunning: boolean` | Whether timer is currently active |
| `currentDescription: string` | Description of current task |
| `currentCategory: string \| null` | Category of current task |
| `start(description, category): Promise<void>` | Start timer, persists state |
| `stop(): Promise<TimeEntry \| null>` | Stop timer, return completed time log |
| `getElapsedMs(): number` | Milliseconds since timer started |
| `getFormattedElapsed(): string` | Formatted "HH:MM" or "HH:MM:SS" |
| `onUpdate(callback): void` | Register UI update callback (called every tick) |
| `startUIUpdates(): void` | Start the setInterval for UI updates |
| `stopUIUpdates(): void` | Clear the UI update interval |
| `resumeIfRunning(): void` | Resume UI updates on plugin reload if timer was running |

### TimeEntryService
| Method | Description |
|--------|-------------|
| `addEntry(entry: TimeEntry): Promise<void>` | Insert time log into daily note table |
| `updateEntry(date, oldStartTime, updatedEntry): Promise<void>` | Replace an existing time log row in the daily note |
| `deleteEntry(date, startTime): Promise<void>` | Remove a time log row and recompute total |
| `getEntriesForDate(dateStr): Promise<TimeEntry[]>` | Parse time logs from a daily note |
| `getEntriesForRange(start, end): Promise<TimeEntry[]>` | Get time logs across multiple days (parallelized) |
| `buildTableRow(entry): string` | Format a time log as a markdown table row |

### ReminderService
| Method | Description |
|--------|-------------|
| `startIdleNudges(): void` | Start periodic "are you tracking?" notifications |
| `stopIdleNudges(): void` | Stop idle nudges |
| `restartIdleNudges(): void` | Restart idle nudges (after settings change) |
| `startActiveReminders(): void` | Start timer-running reminders (interval or schedule) |
| `stopActiveReminders(): void` | Stop timer-running reminders |
| `stop(): void` | Stop everything (plugin unload) |

### ReportService
| Method | Description |
|--------|-------------|
| `getDailySummary(dateStr): Promise<DailySummary>` | Compute summary for one day |
| `getWeeklySummary(weekStartDate): Promise<WeeklySummary>` | Compute 7-day summary (parallelized) |
| `getDateRangeSummary(startISO, endISO): Promise<DateRangeSummary>` | Compute summary for arbitrary date range (parallelized) |
| `formatWeeklySummaryMarkdown(summary): string` | Render weekly summary as markdown |
| `formatDateRangeSummaryMarkdown(summary): string` | Render date range summary as markdown |
| `getWeekStart(date): Date` | Get start of week containing date |

## Plugin Public Methods (main.ts)

| Method | Description |
|--------|-------------|
| `startTimerInteractive(): void` | Open TimerModal (guards if already running) |
| `startTimer(description, category): Promise<void>` | Start timer programmatically |
| `stopTimer(): Promise<void>` | Stop timer, save time log, handle errors |
| `addManualEntry(entry): Promise<void>` | Add a manual time log (from QuickLogModal) |
| `openTodayTimeLog(): Promise<void>` | Navigate to today's daily note |
| `refreshStatusBar(): void` | Refresh the status bar widget display |
| `updateStatusBarVisibility(): void` | Show/hide status bar based on settings |
| `saveSettings(): Promise<void>` | Persist settings to disk |

## Commands (registered in main.ts)

| Command ID | Name | Behavior |
|-----------|------|----------|
| `start-timer` | Start Timer | Opens TimerModal; notice if already running |
| `stop-timer` | Stop Timer | Stops timer, saves time log; notice if not running |
| `toggle-timer` | Toggle Timer | Start if idle, stop if running (primary hotkey target) |
| `quick-log` | Quick Log | Opens QuickLogModal for manual time log |
| `weekly-summary` | Weekly Summary | Opens WeeklySummaryModal |
| `open-today-time-log` | Open Today's Time Log | Navigates to today's daily note |
| `daily-summary` | Daily Summary | Opens DailySummaryModal with goal progress |
| `edit-time-log` | Edit Time Log | Opens EditEntryModal for editing/deleting logs |
| `date-range-report` | Date Range Report | Opens DateRangeReportModal with presets |
| `calendar-heatmap` | Calendar Heatmap | Opens CalendarHeatmapModal (3m/6m/1y) |
| `trend-charts` | Trend Charts | Opens TrendChartsModal (line + stacked area) |
| `start-from-template` | Start Timer from Template | Opens TemplatePickerModal; warns if no templates configured |

## Data Flow

### Timer → Time Log → Markdown
1. User starts timer via modal or status bar click → `TimerService.start()` persists `startedAt` ISO timestamp
2. Status bar updates every 1s (or 60s) via `setInterval` → `StatusBarWidget.update()`
3. Idle nudges suppress while timer runs; active reminders fire per settings
4. User stops timer → `TimerService.stop()` computes duration, returns `TimeEntry`
5. `TimeEntryService.addEntry()` resolves daily note via `DailyNoteIntegration`
6. Time log inserted as markdown table row under `## Time Log`, total row updated
7. On write failure: user gets notice with time log details to log manually

### Edit / Delete Flow
1. User opens Edit Time Log → selects date → `TimeEntryService.getEntriesForDate()` lists logs
2. User edits a log → `TimeEntryService.updateEntry()` replaces the markdown table row, recomputes total
3. User deletes a log → `TimeEntryService.deleteEntry()` removes the row, recomputes total
4. `plugin.refreshStatusBar()` updates the status bar display

### BuJo Integration
- Detection: `app.plugins.getPlugin('obsidian-task-bujo')`
- When present: Time logs go into BuJo's daily note file, appending `## Time Log` section
- When absent: Own daily notes at `TimeTracking/Daily/YYYY-MM-DD.md`
- Time Tracker only touches content within the `## Time Log` section boundary

## Markdown Format

```markdown
## Time Log

| Start | End | Duration | Description |
|-------|-----|----------|-------------|
| 09:00 | 10:30 | 1.5h | Deep Work - Implement feature |
| 10:30 | 11:00 | 0.5h | Review - PR #42 |
| | | **2.0h** | **Total** |
```

- Description format: `{category} - {description}` when category is set
- Total row auto-computed on every insert, update, and delete
- Parsed by `TIME_LOG_ROW_REGEX` and `TOTAL_ROW_REGEX` (see constants.ts)

## Shared Utilities (src/utils.ts)

| Function | Description |
|----------|-------------|
| `formatDateISO(date)` | Date → "YYYY-MM-DD" |
| `parseDate(dateStr)` | "YYYY-MM-DD" → Date (local midnight) |
| `formatTime24(date)` | Date → "HH:MM" |
| `formatTime12(time24)` | "HH:MM" → "h:MM AM/PM" |
| `formatDateDisplay(date)` | Date → "Mon, Mar 16" |
| `formatDisplayFromISO(str)` | "YYYY-MM-DD" → "Mar 16, 2026" |
| `isToday(date)` | Check if date is today |
| `escapeRegex(str)` | Escape string for RegExp |
| `roundEndTime(start, end, mode)` | Round end time to interval (none/5min/15min/30min), returns `{ endTime, durationHours }` |
| `isNonWorkingDay(dateStr, holidays)` | Check if date is a weekend (Sat/Sun) or a configured holiday |
| `getHolidayName(dateStr, holidays)` | Get holiday name for a date, or null |
| `calculateStreaks(days, holidays, excludeNonWorking)` | Compute current and longest work-day streaks, skipping non-working days |

## Performance Notes

- Weekly summary fetches 7 daily files in parallel (`Promise.all`)
- Date range summary also uses parallel fetch for all days in range
- Timer elapsed calculation caches parsed `startedAt` timestamp (avoids `new Date()` on every 1s tick)
- Section finding uses regex on file content — no full-file reparsing
- Status bar updates run at 1s (with seconds) or 60s (without) intervals
- Idle nudge interval checks timer state cheaply before creating `Notice`

## Work-Day Awareness

The plugin is designed for work time tracking (Mon–Fri). When `excludeNonWorkingDays` is enabled:

- **Streaks**: `calculateStreaks()` in `utils.ts` skips weekends and holidays — they neither break nor contribute
- **Heatmap stats**: "Avg/Work Day" only counts weekdays, "Most Productive" only considers Mon–Fri
- **Heatmap rendering**: Non-working days with 0h show diagonal stripe pattern; holidays display names in tooltips
- **Trend charts**: "Workdays only" toggle filters out weekends/holidays from the line chart; 5-day moving average smooths noise
- **Status bar**: Shows goal progress with color indicators (muted → yellow at 75% → green at 100%)

Holidays are managed via `HolidayManagerModal` (year-based UI with bulk import). Data persists in `settings.holidays` for historical accuracy across long trends.

## Known Constraints

- Timer crossing midnight: entry date is the start date; end time may appear < start time
- Category parsing uses " - " separator: descriptions starting with a known category name followed by " - " will be split
- `datalist` autocomplete behavior varies by platform (Electron version)
- All data is stored in standard markdown files — no binary/database state beyond settings JSON
- Holiday list uses linear scan; performance is fine for typical counts (~30/year) but consider `Set` if supporting hundreds
