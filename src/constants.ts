export const PLUGIN_ID = 'obsidian-time-tracker';
export const BUJO_PLUGIN_ID = 'obsidian-task-bujo';

/**
 * Regex to parse a time log table row. Accepts BOTH the legacy 4-column shape
 * and the v2 5-column shape introduced with Topic/JIRA references:
 *
 *   v1: `| HH:MM | HH:MM | X.Xh | Description |`
 *   v2: `| HH:MM | HH:MM | X.Xh | Description | Reference |`
 *
 * Captures: startTime, endTime, duration, description, reference (optional, v2 only)
 */
export const TIME_LOG_ROW_REGEX =
	/^\|\s*(\d{1,2}:\d{2})\s*\|\s*(\d{1,2}:\d{2})\s*\|\s*([\d.]+h)\s*\|\s*(.+?)\s*(?:\|\s*(.*?)\s*)?\|$/;

/** Regex to parse daily total row: v1 `| | | **X.Xh** | **Total** |` or v2 with trailing empty cell. */
export const TOTAL_ROW_REGEX =
	/^\|\s*\|\s*\|\s*\*\*([\d.]+h)\*\*\s*\|\s*\*\*Total\*\*\s*(?:\|\s*\|)?\s*\|?$/;

/** Legacy (v1) 4-column table header + separator — kept for backward compatibility. */
export const TABLE_HEADER = '| Start | End | Duration | Description |';
export const TABLE_SEPARATOR = '|-------|-----|----------|-------------|';

/** v2 5-column header + separator, with the optional Reference column. */
export const TABLE_HEADER_V2 = '| Start | End | Duration | Description | Reference |';
export const TABLE_SEPARATOR_V2 = '|-------|-----|----------|-------------|-----------|';

/**
 * Whitespace-tolerant header detection. External table formatters (e.g.
 * Advanced Tables) re-align columns, which would otherwise break an exact-string
 * match and cause the plugin to rebuild the table from scratch.
 */
export const HEADER_V2_REGEX = /^\|\s*Start\s*\|\s*End\s*\|\s*Duration\s*\|\s*Description\s*\|\s*Reference\s*\|\s*$/m;
export const HEADER_V1_REGEX = /^\|\s*Start\s*\|\s*End\s*\|\s*Duration\s*\|\s*Description\s*\|\s*$/m;

/** JIRA issue-key format (uppercase project key + hyphen + number). */
export const JIRA_KEY_REGEX = /^[A-Z][A-Z0-9]+-\d+$/;

/** Matches a wiki-link stored in the Reference cell, e.g. `[[Topic Title]]`. */
export const WIKILINK_REF_REGEX = /^\[\[(.+?)\]\]$/;

export const STATUS_BAR_IDLE_TEXT = 'No timer';
