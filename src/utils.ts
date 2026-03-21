/** Shared date and time utility functions used across the plugin */

/** Format a Date to YYYY-MM-DD */
export function formatDateISO(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Parse a YYYY-MM-DD string into a Date (local timezone, midnight) */
export function parseDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Format a Date to HH:MM (24h) */
export function formatTime24(date: Date): string {
	const h = String(date.getHours()).padStart(2, '0');
	const m = String(date.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

/** Convert HH:MM (24h) to h:MM AM/PM (12h) */
export function formatTime12(time24: string): string {
	const [hStr, mStr] = time24.split(':');
	let h = parseInt(hStr);
	const suffix = h >= 12 ? 'PM' : 'AM';
	if (h === 0) h = 12;
	else if (h > 12) h -= 12;
	return `${h}:${mStr} ${suffix}`;
}

/** Format a display date like "Mon, Mar 16" */
export function formatDateDisplay(date: Date): string {
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

/** Format a display date like "Mar 16, 2026" from a YYYY-MM-DD string */
export function formatDisplayFromISO(dateStr: string): string {
	const date = parseDate(dateStr);
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Check if a Date is today */
export function isToday(date: Date): boolean {
	const now = new Date();
	return date.getFullYear() === now.getFullYear()
		&& date.getMonth() === now.getMonth()
		&& date.getDate() === now.getDate();
}

/** Escape a string for use in a RegExp */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
