export const PLUGIN_ID = 'obsidian-time-tracker';
export const BUJO_PLUGIN_ID = 'obsidian-task-bujo';

/** Regex to parse a time log table row:
 *  | HH:MM | HH:MM | X.Xh | Description |
 *  Captures: startTime, endTime, duration, description */
export const TIME_LOG_ROW_REGEX =
	/^\|\s*(\d{1,2}:\d{2})\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*([\d.]+h)\s*\|\s*(.+?)\s*\|$/;

/** Regex to parse daily total row: | | | **X.Xh** | **Total** | */
export const TOTAL_ROW_REGEX =
	/^\|\s*\|\s*\|\s*\*\*([\d.]+h)\*\*\s*\|\s*\*\*Total\*\*\s*\|$/;

export const TABLE_HEADER = '| Start | End | Duration | Description |';
export const TABLE_SEPARATOR = '|-------|-----|----------|-------------|';

export const STATUS_BAR_IDLE_TEXT = 'No timer';
