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
├── ReportService (services/)         — daily/weekly summary computation
├── StatusBarWidget (ui/)             — status bar timer display
├── TimerModal (ui/)                  — modal for starting a timer
├── QuickLogModal (ui/)               — modal for manual time entry
├── WeeklySummaryModal (ui/)          — modal for weekly report view
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
    DailyNoteIntegration.ts  — BuJo detection, daily note path resolution, section management
    TimerService.ts          — Timer start/stop, elapsed time, persistence across restarts
    TimeEntryService.ts      — Add/read/parse time entries in markdown tables
    ReminderService.ts       — Idle nudges + active timer reminders (interval & schedule)
    ReportService.ts         — Daily/weekly summary computation, markdown export
  ui/
    StatusBarWidget.ts       — Status bar element with pulsing dot, click handler
    TimerModal.ts            — Start timer modal (description + category)
    QuickLogModal.ts         — Manual entry modal (date, start, end, description, category)
    WeeklySummaryModal.ts    — Weekly report modal with bar charts
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
  startedAt: string | null;      // ISO timestamp
  currentDescription: string;
  currentCategory: string | null;
}
```

### PluginSettings (18 configurable options)
```typescript
interface PluginSettings {
  standaloneDailyNotePath: string;       // default: 'TimeTracking/Daily'
  enableBuJoIntegration: boolean;        // default: true
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
| `stop(): Promise<TimeEntry \| null>` | Stop timer, return completed entry |
| `getElapsedMs(): number` | Milliseconds since timer started |
| `getFormattedElapsed(): string` | Formatted "HH:MM" or "HH:MM:SS" |
| `onUpdate(callback): void` | Register UI update callback (called every tick) |
| `startUIUpdates(): void` | Start the setInterval for UI updates |
| `stopUIUpdates(): void` | Clear the UI update interval |
| `resumeIfRunning(): void` | Resume UI updates on plugin reload if timer was running |

### TimeEntryService
| Method | Description |
|--------|-------------|
| `addEntry(entry: TimeEntry): Promise<void>` | Insert entry into daily note table |
| `getEntriesForDate(dateStr): Promise<TimeEntry[]>` | Parse entries from a daily note |
| `getEntriesForRange(start, end): Promise<TimeEntry[]>` | Get entries across multiple days (parallelized) |
| `buildTableRow(entry): string` | Format an entry as a markdown table row |

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
| `formatWeeklySummaryMarkdown(summary): string` | Render summary as markdown |
| `getWeekStart(date): Date` | Get start of week containing date |

## Commands (registered in main.ts)

| Command ID | Name | Behavior |
|-----------|------|----------|
| `start-timer` | Start Timer | Opens TimerModal; notice if already running |
| `stop-timer` | Stop Timer | Stops timer, saves entry; notice if not running |
| `toggle-timer` | Toggle Timer | Start if idle, stop if running (primary hotkey target) |
| `quick-log` | Quick Log Entry | Opens QuickLogModal for manual entry |
| `weekly-summary` | Weekly Summary | Opens WeeklySummaryModal |
| `open-today-time-log` | Open Today's Time Log | Navigates to today's daily note |

## Data Flow

### Timer → Entry → Markdown
1. User starts timer via modal or status bar click → `TimerService.start()` persists `startedAt` ISO timestamp
2. Status bar updates every 1s (or 60s) via `setInterval` → `StatusBarWidget.update()`
3. Idle nudges suppress while timer runs; active reminders fire per settings
4. User stops timer → `TimerService.stop()` computes duration, returns `TimeEntry`
5. `TimeEntryService.addEntry()` resolves daily note via `DailyNoteIntegration`
6. Entry inserted as markdown table row under `## Time Log`, total row updated
7. On write failure: user gets notice with entry details to log manually

### BuJo Integration
- Detection: `app.plugins.getPlugin('obsidian-task-bujo')`
- When present: Time entries go into BuJo's daily note file, appending `## Time Log` section
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
- Total row auto-computed on every insert
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

## Performance Notes

- Weekly summary fetches 7 daily files in parallel (`Promise.all`)
- Timer elapsed calculation caches parsed `startedAt` timestamp (avoids `new Date()` on every 1s tick)
- Section finding uses regex on file content — no full-file reparsing
- Status bar updates run at 1s (with seconds) or 60s (without) intervals
- Idle nudge interval checks timer state cheaply before creating `Notice`

## Known Constraints

- Timer crossing midnight: entry date is the start date; end time may appear < start time
- Category parsing uses " - " separator: descriptions starting with a known category name followed by " - " will be split
- `datalist` autocomplete behavior varies by platform (Electron version)
- All data is stored in standard markdown files — no binary/database state beyond settings JSON
