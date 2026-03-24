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
├── DailyNoteIntegration (services/)  — resolves daily note paths, BuJo + Obsidian Daily Notes detection
├── TimerService (services/)          — timer state machine with pause/resume + persistence
├── TimeEntryService (services/)      — CRUD for markdown table logs + category auto-learning
├── ReminderService (services/)       — idle nudges + active timer notifications
├── ReportService (services/)         — daily/weekly/monthly summary computation
├── StatusBarWidget (ui/)             — status bar timer display + daily total
├── TimerModal (ui/)                  — modal for starting a timer
├── QuickLogModal (ui/)               — modal for manual time log (Log Time)
├── EditEntryModal (ui/)             — modal for editing/deleting logs (any date)
├── DailySummaryModal (ui/)          — modal for daily summary with navigation
├── WeeklySummaryModal (ui/)          — modal for weekly/monthly report view
├── CategorySuggest (ui/)             — datalist autocomplete for categories
└── TimeTrackerSettingTab (settings.ts) — plugin settings UI
```

## File Structure

```
src/
  main.ts              — Plugin lifecycle, command registration, service wiring
  types.ts             — All interfaces, enums, defaults (TimeEntry, TimerState, PluginSettings, etc.)
  constants.ts         — Regex patterns, plugin IDs, table templates
  settings.ts          — PluginSettingTab with 5 sections
  utils.ts             — Shared date/time utilities (formatDateISO, parseDate, formatTime12, etc.)
  services/
    DailyNoteIntegration.ts  — BuJo + Obsidian Daily Notes detection, path resolution, section management
    TimerService.ts          — Timer start/stop/pause/resume, midnight split, persistence across restarts
    TimeEntryService.ts      — Add/read/update/delete time logs in markdown tables, category auto-learning
    ReminderService.ts       — Idle nudges + active timer reminders (interval & schedule)
    ReportService.ts         — Daily/weekly/monthly summary computation, markdown export
  ui/
    StatusBarWidget.ts       — Status bar with daily total, paused state, context menu
    TimerModal.ts            — Start timer modal (description + category)
    QuickLogModal.ts         — Log Time modal (date, start, end, description, category)
    EditEntryModal.ts        — Edit/delete logs with date picker (any date)
    DailySummaryModal.ts     — Daily summary modal with day navigation
    WeeklySummaryModal.ts    — Weekly/monthly report modal with bar charts and toggle
    CategorySuggest.ts       — HTML datalist-based category autocomplete
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
  isPaused: boolean;
  startedAt: string | null;      // ISO timestamp
  accumulatedMs: number;         // ms accumulated before pauses
  currentDescription: string;
  currentCategory: string | null;
}
```

### PluginSettings (18 configurable options)
```typescript
interface PluginSettings {
  standaloneDailyNotePath: string;       // default: 'TimeTracking/Daily'
  enableBuJoIntegration: boolean;        // default: true
  enableObsidianDailyNotesIntegration: boolean; // default: true
  buJoDailyNotePathOverride: string;     // default: '' (auto-detect)
  timeLogHeading: string;                // default: '## Time Log'
  categories: string[];                  // default: ['Deep Work', 'Meetings', 'Admin', 'Review', 'Learning']
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
}
```

### ReminderMode
```typescript
enum ReminderMode { Interval = 'interval', Schedule = 'schedule', Off = 'off' }
```

### Report Types
```typescript
interface DailySummary { date, entries, totalHours, byCategory }
interface WeeklySummary { weekStart, weekEnd, days, totalHours, byCategory }
interface MonthlySummary { month, days, totalHours, byCategory }
```

## Service APIs

### DailyNoteIntegration
| Method | Description |
|--------|-------------|
| `isBuJoAvailable(): boolean` | Check if BuJo plugin is installed and integration enabled |
| `isObsidianDailyNotesAvailable(): boolean` | Check if Obsidian core Daily Notes plugin is enabled |
| `getBuJoDailyNotePath(): string` | Get BuJo's daily note folder path (auto-detect or override) |
| `getDailyNotePath(date: Date): string` | Get full file path for a date's daily note |
| `getOrCreateDailyNote(date: Date): Promise<TFile>` | Get or create daily note, ensures Time Log section exists |
| `ensureTimeLogSection(file: TFile): Promise<void>` | Append Time Log heading to file if missing |
| `findTimeLogSection(content: string): {start, end} \| null` | Find section boundaries in file content |

### TimerService
| Method | Description |
|--------|-------------|
| `isRunning: boolean` | Whether timer is currently active (running or paused) |
| `isPaused: boolean` | Whether timer is paused |
| `currentDescription: string` | Description of current task |
| `currentCategory: string \| null` | Category of current task |
| `start(description, category): Promise<void>` | Start timer, persists state |
| `pause(): Promise<void>` | Pause the running timer, accumulate elapsed time |
| `resume(): Promise<void>` | Resume a paused timer |
| `stop(): Promise<TimeEntry[] \| null>` | Stop timer, return logs (array for midnight split) |
| `getElapsedMs(): number` | Milliseconds since timer started |
| `getFormattedElapsed(): string` | Formatted "HH:MM" or "HH:MM:SS" |
| `onUpdate(callback): void` | Register UI update callback (called every tick) |
| `startUIUpdates(): void` | Start the setInterval for UI updates |
| `stopUIUpdates(): void` | Clear the UI update interval |
| `resumeIfRunning(): void` | Resume UI updates on plugin reload if timer was running |

### TimeEntryService
| Method | Description |
|--------|-------------|
| `setOnNewCategory(callback): void` | Register callback for category auto-learning |
| `addEntry(entry: TimeEntry): Promise<void>` | Insert log into daily note table (auto-learns category) |
| `updateEntry(dateStr, originalStartTime, updated): Promise<void>` | Replace an existing log row and recalculate total |
| `deleteEntry(dateStr, startTime): Promise<void>` | Remove a log row and recalculate total |
| `getEntriesForDate(dateStr): Promise<TimeEntry[]>` | Parse logs from a daily note |
| `getEntriesForRange(start, end): Promise<TimeEntry[]>` | Get logs across multiple days (parallelized) |
| `buildTableRow(entry): string` | Format a log as a markdown table row |

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
| `getMonthlySummary(year, month): Promise<MonthlySummary>` | Compute full month summary (parallelized) |
| `formatWeeklySummaryMarkdown(summary): string` | Render weekly summary as markdown |
| `formatMonthlySummaryMarkdown(summary): string` | Render monthly summary as markdown |
| `getWeekStart(date): Date` | Get start of week containing date |

## Commands (registered in main.ts)

| Command ID | Name | Behavior |
|-----------|------|----------|
| `start-timer` | Start Timer | Opens TimerModal; notice if already running |
| `stop-timer` | Stop Timer | Stops timer, saves log (auto-splits at midnight); notice if not running |
| `pause-timer` | Pause Timer | Pauses running timer, accumulates elapsed time |
| `resume-timer` | Resume Timer | Resumes a paused timer |
| `toggle-timer` | Toggle Timer | Cycles: idle→start, running→pause, paused→resume |
| `quick-log` | Log Time | Opens QuickLogModal for manual log |
| `edit-time-log` | Edit Time Log | Opens EditEntryModal with date picker for any date |
| `daily-summary` | Daily Summary | Opens DailySummaryModal with day navigation |
| `weekly-summary` | Weekly Summary | Opens WeeklySummaryModal (weekly/monthly toggle) |
| `open-today-time-log` | Open Today's Time Log | Navigates to today's daily note |

## Data Flow

### Timer → Log → Markdown
1. User starts timer via modal or status bar click → `TimerService.start()` persists `startedAt` ISO timestamp
2. Status bar updates every 1s (or 60s) via `setInterval` → `StatusBarWidget.update()`
3. Idle nudges suppress while timer runs; active reminders fire per settings
4. User stops timer → `TimerService.stop()` computes duration, returns `TimeEntry`
5. `TimeEntryService.addEntry()` resolves daily note via `DailyNoteIntegration`
6. Log inserted as markdown table row under `## Time Log`, total row updated
7. On write failure: user gets notice with log details to log manually

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
- Total row auto-computed on every insert, update, or delete
- `TIME_LOG_ROW_REGEX` supports both 24h (`HH:MM`) and 12h (`H:MM AM/PM`) time formats
- Parsed times are normalized to 24h internally via `parseTimeTo24()`
- Parsed by `TIME_LOG_ROW_REGEX` and `TOTAL_ROW_REGEX` (see constants.ts)

## Shared Utilities (src/utils.ts)

| Function | Description |
|----------|-------------|
| `formatDateISO(date)` | Date → "YYYY-MM-DD" |
| `parseDate(dateStr)` | "YYYY-MM-DD" → Date (local midnight) |
| `formatTime24(date)` | Date → "HH:MM" |
| `formatTime12(time24)` | "HH:MM" → "h:MM AM/PM" |
| `parseTimeTo24(time)` | "HH:MM" or "h:MM AM/PM" → "HH:MM" (24h normalized) |
| `formatDateDisplay(date)` | Date → "Mon, Mar 16" |
| `formatDisplayFromISO(str)` | "YYYY-MM-DD" → "Mar 16, 2026" |
| `isToday(date)` | Check if date is today |
| `escapeRegex(str)` | Escape string for RegExp |

## Performance Notes

- Weekly summary fetches 7 daily files in parallel (`Promise.all`)
- Timer elapsed calculation caches parsed `startedAt` timestamp (avoids `new Date()` on every 1s tick)
- Section finding uses regex on file content — no full-file reparsing
- Status bar updates run at 1s (with seconds) or 60s (without) intervals
- Idle nudge interval checks timer state cheaply before creating `Notice`

## Known Constraints

- Timer crossing midnight: log date is the start date; end time may appear < start time
- Category parsing uses " - " separator: descriptions starting with a known category name followed by " - " will be split
- `datalist` autocomplete behavior varies by platform (Electron version)
- All data is stored in standard markdown files — no binary/database state beyond settings JSON
