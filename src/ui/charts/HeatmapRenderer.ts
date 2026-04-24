import { formatDateISO, isNonWorkingDay, getHolidayName } from '../../utils';
import { HeatmapColorScheme, HEATMAP_COLOR_SCHEMES, Holiday } from '../../types';

const CELL_SIZE = 18;
const CELL_GAP = 4;
const LABEL_WIDTH = 36;
const MONTH_LABEL_HEIGHT = 20;

export type HeatmapScaleMode = 'goal' | 'relative';

const DAY_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Render a GitHub-style calendar heatmap as inline SVG.
 * Returns the SVG element and a tooltip element that the caller should add to the DOM.
 */
export function renderHeatmap(
	container: HTMLElement,
	data: Map<string, number>,
	startDate: Date,
	endDate: Date,
	weekStartDay: number,
	colorScheme: HeatmapColorScheme = 'green',
	scaleMode: HeatmapScaleMode = 'relative',
	dailyGoalHours = 0,
	holidays: Holiday[] = [],
	excludeNonWorkingDays = false
): { svg: SVGSVGElement; tooltip: HTMLElement } {
	// Build week columns from startDate to endDate
	const start = new Date(startDate);
	start.setHours(0, 0, 0, 0);
	const end = new Date(endDate);
	end.setHours(0, 0, 0, 0);

	// Align start to week start
	const startDayOffset = (start.getDay() - weekStartDay + 7) % 7;
	const alignedStart = new Date(start);
	alignedStart.setDate(alignedStart.getDate() - startDayOffset);

	// Collect all cells
	interface Cell {
		date: Date;
		dateStr: string;
		hours: number;
		col: number;
		row: number;
		isNonWorking: boolean;
		holidayName: string | null;
	}

	const cells: Cell[] = [];
	const current = new Date(alignedStart);
	let col = 0;

	while (current <= end) {
		for (let row = 0; row < 7; row++) {
			const dateStr = formatDateISO(current);
			const hours = data.get(dateStr) ?? 0;
			const isInRange = current >= start && current <= end;

			if (isInRange) {
				cells.push({
					date: new Date(current),
					dateStr,
					hours,
					col,
					row,
					isNonWorking: excludeNonWorkingDays && isNonWorkingDay(dateStr, holidays),
					holidayName: getHolidayName(dateStr, holidays),
				});
			}

			current.setDate(current.getDate() + 1);
		}
		col++;
	}

	const totalCols = col;
	const svgWidth = LABEL_WIDTH + totalCols * (CELL_SIZE + CELL_GAP);
	const svgHeight = MONTH_LABEL_HEIGHT + 7 * (CELL_SIZE + CELL_GAP);

	// Resolve color scheme
	const scheme = HEATMAP_COLOR_SCHEMES[colorScheme] ?? HEATMAP_COLOR_SCHEMES.green;
	const isAccent = colorScheme === 'accent';

	// Create SVG
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', String(svgWidth));
	svg.setAttribute('height', String(svgHeight));
	svg.setAttribute('class', 'time-tracker-heatmap');

	// Add defs with diagonal stripe pattern for non-working days
	const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
	const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
	pattern.setAttribute('id', 'non-working-pattern');
	pattern.setAttribute('width', '6');
	pattern.setAttribute('height', '6');
	pattern.setAttribute('patternUnits', 'userSpaceOnUse');
	pattern.setAttribute('patternTransform', 'rotate(45)');

	// Background fill for the pattern
	const patternBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
	patternBg.setAttribute('width', '6');
	patternBg.setAttribute('height', '6');
	patternBg.setAttribute('fill', 'var(--background-modifier-border)');
	pattern.appendChild(patternBg);

	const patternLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	patternLine.setAttribute('x1', '0');
	patternLine.setAttribute('y1', '0');
	patternLine.setAttribute('x2', '0');
	patternLine.setAttribute('y2', '6');
	patternLine.setAttribute('stroke', 'var(--background-secondary)');
	patternLine.setAttribute('stroke-width', '2');
	pattern.appendChild(patternLine);

	defs.appendChild(pattern);
	svg.appendChild(defs);

	// Day-of-week labels (show Mon, Wed, Fri)
	const dayLabelsToShow = [1, 3, 5]; // indices relative to weekStartDay
	for (const offset of dayLabelsToShow) {
		const row = offset;
		if (row < 7) {
			const dayIndex = (weekStartDay + row) % 7;
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('x', String(LABEL_WIDTH - 4));
			text.setAttribute('y', String(MONTH_LABEL_HEIGHT + row * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2));
			text.setAttribute('class', 'time-tracker-heatmap-day-label');
			text.textContent = DAY_LABELS_SHORT[dayIndex].substring(0, 3);
			svg.appendChild(text);
		}
	}

	// Month labels along top
	let lastMonth = -1;
	for (const cell of cells) {
		if (cell.row === 0) {
			const month = cell.date.getMonth();
			if (month !== lastMonth) {
				lastMonth = month;
				const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
				const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				text.setAttribute('x', String(LABEL_WIDTH + cell.col * (CELL_SIZE + CELL_GAP)));
				text.setAttribute('y', String(MONTH_LABEL_HEIGHT - 4));
				text.setAttribute('class', 'time-tracker-heatmap-month-label');
				text.textContent = monthNames[month];
				svg.appendChild(text);
			}
		}
	}

	// Determine scaling reference for intensity
	const useGoalScale = scaleMode === 'goal' && dailyGoalHours > 0;
	const scaleRef = useGoalScale
		? dailyGoalHours
		: Math.max(...Array.from(data.values()), 1);

	// Render cells
	for (const cell of cells) {
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		const x = LABEL_WIDTH + cell.col * (CELL_SIZE + CELL_GAP);
		const y = MONTH_LABEL_HEIGHT + cell.row * (CELL_SIZE + CELL_GAP);

		rect.setAttribute('x', String(x));
		rect.setAttribute('y', String(y));
		rect.setAttribute('width', String(CELL_SIZE));
		rect.setAttribute('height', String(CELL_SIZE));
		rect.setAttribute('rx', '3');
		rect.setAttribute('ry', '3');

		const level = getIntensityLevel(cell.hours, scaleRef, useGoalScale);

		if (cell.isNonWorking && level === 0) {
			// Non-working day with no hours: diagonal stripe pattern
			rect.setAttribute('class', 'time-tracker-heatmap-cell');
			rect.setAttribute('fill', 'url(#non-working-pattern)');
		} else if (isAccent) {
			rect.setAttribute('class', `time-tracker-heatmap-cell level-${level}`);
		} else {
			rect.setAttribute('class', 'time-tracker-heatmap-cell');
			if (level === 0) {
				rect.style.fill = 'var(--background-modifier-border)';
			} else if (level === 5) {
				rect.style.fill = scheme.overtime;
			} else {
				rect.style.fill = scheme.colors[level - 1];
			}
		}

		rect.setAttribute('data-date', cell.dateStr);
		rect.setAttribute('data-hours', String(cell.hours));
		rect.setAttribute('data-non-working', cell.isNonWorking ? '1' : '0');
		if (cell.holidayName) {
			rect.setAttribute('data-holiday', cell.holidayName);
		}

		svg.appendChild(rect);

		// Small corner indicator for non-working days that have logged hours
		if (cell.isNonWorking && cell.hours > 0) {
			const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			indicator.setAttribute('cx', String(x + CELL_SIZE - 3));
			indicator.setAttribute('cy', String(y + 3));
			indicator.setAttribute('r', '2');
			indicator.setAttribute('fill', 'var(--text-muted)');
			indicator.setAttribute('class', 'time-tracker-heatmap-nw-indicator');
			svg.appendChild(indicator);
		}
	}

	container.appendChild(svg);

	// Tooltip — positioned absolutely within the wrapper (no layout jumps)
	const tooltip = container.createDiv({ cls: 'time-tracker-heatmap-tooltip' });
	tooltip.style.display = 'none';

	svg.addEventListener('mouseover', (e: Event) => {
		const target = e.target as Element;
		if (target.tagName === 'rect' && target.hasAttribute('data-date')) {
			const dateStr = target.getAttribute('data-date')!;
			const hours = target.getAttribute('data-hours')!;
			const holidayName = target.getAttribute('data-holiday');
			const date = new Date(dateStr + 'T00:00:00');
			const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

			let label = `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}: ${parseFloat(hours) > 0 ? hours + 'h' : 'No data'}`;
			if (holidayName) {
				label += ` (${holidayName})`;
			}

			tooltip.textContent = label;
			tooltip.style.display = 'block';

			const rect = target.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const tooltipRect = tooltip.getBoundingClientRect();

			// Horizontal: center tooltip on cell, clamp to container bounds
			const cellCenterX = rect.left - containerRect.left + CELL_SIZE / 2;
			const halfTooltip = tooltipRect.width / 2;
			const minLeft = halfTooltip;
			const maxLeft = containerRect.width - halfTooltip;
			const clampedLeft = Math.max(minLeft, Math.min(maxLeft, cellCenterX));
			tooltip.style.left = `${clampedLeft}px`;

			// Vertical: position above cell, but flip below if it would be clipped
			const aboveTop = rect.top - containerRect.top - tooltipRect.height - 6;
			if (aboveTop < 0) {
				tooltip.style.top = `${rect.bottom - containerRect.top + 6}px`;
			} else {
				tooltip.style.top = `${aboveTop}px`;
			}
		}
	});

	svg.addEventListener('mouseout', (e: Event) => {
		const target = e.target as Element;
		if (target.tagName === 'rect') {
			tooltip.style.display = 'none';
		}
	});

	return { svg, tooltip };
}

function getIntensityLevel(hours: number, scaleRef: number, isGoalScale: boolean): number {
	if (hours === 0) return 0;
	const ratio = hours / scaleRef;
	if (isGoalScale && ratio > 1.0) return 5; // Overtime — exceeded goal
	if (ratio <= 0.25) return 1;
	if (ratio <= 0.50) return 2;
	if (ratio <= 0.75) return 3;
	return 4;
}

/**
 * Render a traditional month calendar grid: 7 columns (days of week) × up to 6 rows.
 * Days before today are filled based on logged hours; today and future days are visibly empty.
 */
export function renderMonthCalendar(
	container: HTMLElement,
	data: Map<string, number>,
	monthDate: Date,
	weekStartDay: number,
	colorScheme: HeatmapColorScheme = 'green',
	scaleMode: HeatmapScaleMode = 'relative',
	dailyGoalHours = 0,
	holidays: Holiday[] = [],
	excludeNonWorkingDays = false
): { svg: SVGSVGElement; tooltip: HTMLElement } {
	const CELL = 48;
	const GAP = 6;
	const HEADER_H = 22;

	const year = monthDate.getFullYear();
	const month = monthDate.getMonth();
	const firstOfMonth = new Date(year, month, 1);
	const lastOfMonth = new Date(year, month + 1, 0);
	const daysInMonth = lastOfMonth.getDate();

	// Align first day to week start (backfill with prev-month placeholders)
	const startOffset = (firstOfMonth.getDay() - weekStartDay + 7) % 7;
	const totalCells = startOffset + daysInMonth;
	const rows = Math.ceil(totalCells / 7);

	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const todayStr = formatDateISO(today);

	const svgWidth = 7 * CELL + 6 * GAP;
	const svgHeight = HEADER_H + rows * CELL + (rows - 1) * GAP;

	const scheme = HEATMAP_COLOR_SCHEMES[colorScheme] ?? HEATMAP_COLOR_SCHEMES.green;
	const isAccent = colorScheme === 'accent';

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', String(svgWidth));
	svg.setAttribute('height', String(svgHeight));
	svg.setAttribute('class', 'time-tracker-heatmap time-tracker-month-calendar');

	// Non-working stripe pattern (reused id; defs scoped inside this svg)
	const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
	const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
	pattern.setAttribute('id', 'non-working-pattern-month');
	pattern.setAttribute('width', '6');
	pattern.setAttribute('height', '6');
	pattern.setAttribute('patternUnits', 'userSpaceOnUse');
	pattern.setAttribute('patternTransform', 'rotate(45)');
	const patternBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
	patternBg.setAttribute('width', '6');
	patternBg.setAttribute('height', '6');
	patternBg.setAttribute('fill', 'var(--background-modifier-border)');
	pattern.appendChild(patternBg);
	const patternLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
	patternLine.setAttribute('x1', '0');
	patternLine.setAttribute('y1', '0');
	patternLine.setAttribute('x2', '0');
	patternLine.setAttribute('y2', '6');
	patternLine.setAttribute('stroke', 'var(--background-secondary)');
	patternLine.setAttribute('stroke-width', '2');
	pattern.appendChild(patternLine);
	defs.appendChild(pattern);
	svg.appendChild(defs);

	// Day-of-week header row
	for (let col = 0; col < 7; col++) {
		const dayIndex = (weekStartDay + col) % 7;
		const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		text.setAttribute('x', String(col * (CELL + GAP) + CELL / 2));
		text.setAttribute('y', String(HEADER_H - 8));
		text.setAttribute('text-anchor', 'middle');
		text.setAttribute('class', 'time-tracker-month-dow-label');
		text.textContent = DAY_LABELS_SHORT[dayIndex];
		svg.appendChild(text);
	}

	// Scale reference — restrict to this month's values
	const monthValues: number[] = [];
	for (let d = 1; d <= daysInMonth; d++) {
		const ds = formatDateISO(new Date(year, month, d));
		const h = data.get(ds) ?? 0;
		if (h > 0) monthValues.push(h);
	}
	const useGoalScale = scaleMode === 'goal' && dailyGoalHours > 0;
	const scaleRef = useGoalScale ? dailyGoalHours : Math.max(...monthValues, 1);

	// Day cells
	for (let d = 1; d <= daysInMonth; d++) {
		const date = new Date(year, month, d);
		const dateStr = formatDateISO(date);
		const hours = data.get(dateStr) ?? 0;

		const cellIndex = startOffset + (d - 1);
		const col = cellIndex % 7;
		const row = Math.floor(cellIndex / 7);
		const x = col * (CELL + GAP);
		const y = HEADER_H + row * (CELL + GAP);

		const isFuture = dateStr > todayStr;
		const isToday = dateStr === todayStr;
		const isNW = excludeNonWorkingDays && isNonWorkingDay(dateStr, holidays);
		const holidayName = getHolidayName(dateStr, holidays);

		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('class', 'time-tracker-month-cell-group');

		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', String(x));
		rect.setAttribute('y', String(y));
		rect.setAttribute('width', String(CELL));
		rect.setAttribute('height', String(CELL));
		rect.setAttribute('rx', '6');
		rect.setAttribute('ry', '6');

		const level = getIntensityLevel(hours, scaleRef, useGoalScale);

		if (isFuture) {
			rect.setAttribute('class', 'time-tracker-heatmap-cell time-tracker-month-cell-future');
			rect.style.fill = 'var(--background-secondary)';
			rect.style.opacity = '0.4';
		} else if (isNW && level === 0) {
			rect.setAttribute('class', 'time-tracker-heatmap-cell');
			rect.setAttribute('fill', 'url(#non-working-pattern-month)');
		} else if (isAccent) {
			rect.setAttribute('class', `time-tracker-heatmap-cell level-${level}`);
		} else {
			rect.setAttribute('class', 'time-tracker-heatmap-cell');
			if (level === 0) {
				rect.style.fill = 'var(--background-modifier-border)';
			} else if (level === 5) {
				rect.style.fill = scheme.overtime;
			} else {
				rect.style.fill = scheme.colors[level - 1];
			}
		}

		if (isToday) {
			rect.setAttribute('stroke', 'var(--interactive-accent)');
			rect.setAttribute('stroke-width', '2');
		}

		rect.setAttribute('data-date', dateStr);
		rect.setAttribute('data-hours', String(hours));
		rect.setAttribute('data-non-working', isNW ? '1' : '0');
		if (holidayName) rect.setAttribute('data-holiday', holidayName);

		g.appendChild(rect);

		// Day number
		const dayText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		dayText.setAttribute('x', String(x + 6));
		dayText.setAttribute('y', String(y + 14));
		dayText.setAttribute('class', 'time-tracker-month-day-number');
		dayText.setAttribute('pointer-events', 'none');
		dayText.textContent = String(d);
		g.appendChild(dayText);

		// Hours label (only when logged)
		if (!isFuture && hours > 0) {
			const hoursText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			hoursText.setAttribute('x', String(x + CELL / 2));
			hoursText.setAttribute('y', String(y + CELL - 8));
			hoursText.setAttribute('text-anchor', 'middle');
			hoursText.setAttribute('class', 'time-tracker-month-hours-label');
			hoursText.setAttribute('pointer-events', 'none');
			hoursText.textContent = `${hours}h`;
			g.appendChild(hoursText);
		}

		// Non-working indicator when hours logged
		if (isNW && hours > 0) {
			const indicator = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			indicator.setAttribute('cx', String(x + CELL - 5));
			indicator.setAttribute('cy', String(y + 5));
			indicator.setAttribute('r', '2.5');
			indicator.setAttribute('fill', 'var(--text-muted)');
			indicator.setAttribute('pointer-events', 'none');
			g.appendChild(indicator);
		}

		svg.appendChild(g);
	}

	container.appendChild(svg);

	// Tooltip
	const tooltip = container.createDiv({ cls: 'time-tracker-heatmap-tooltip' });
	tooltip.style.display = 'none';

	svg.addEventListener('mouseover', (e: Event) => {
		const target = e.target as Element;
		if (target.tagName === 'rect' && target.hasAttribute('data-date')) {
			const dateStr = target.getAttribute('data-date')!;
			const hours = target.getAttribute('data-hours')!;
			const holidayName = target.getAttribute('data-holiday');
			const date = new Date(dateStr + 'T00:00:00');
			const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

			let label = `${dayNames[date.getDay()]}, ${monthNames[date.getMonth()]} ${date.getDate()}: ${parseFloat(hours) > 0 ? hours + 'h' : 'No data'}`;
			if (holidayName) label += ` (${holidayName})`;

			tooltip.textContent = label;
			tooltip.style.display = 'block';

			const rect = target.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const tooltipRect = tooltip.getBoundingClientRect();

			const cellCenterX = rect.left - containerRect.left + rect.width / 2;
			const halfTooltip = tooltipRect.width / 2;
			const minLeft = halfTooltip;
			const maxLeft = containerRect.width - halfTooltip;
			const clampedLeft = Math.max(minLeft, Math.min(maxLeft, cellCenterX));
			tooltip.style.left = `${clampedLeft}px`;

			const aboveTop = rect.top - containerRect.top - tooltipRect.height - 6;
			if (aboveTop < 0) {
				tooltip.style.top = `${rect.bottom - containerRect.top + 6}px`;
			} else {
				tooltip.style.top = `${aboveTop}px`;
			}
		}
	});

	svg.addEventListener('mouseout', (e: Event) => {
		const target = e.target as Element;
		if (target.tagName === 'rect') tooltip.style.display = 'none';
	});

	return { svg, tooltip };
}

/**
 * Render a heatmap legend bar.
 */
export function renderHeatmapLegend(
	container: HTMLElement,
	colorScheme: HeatmapColorScheme = 'green',
	showOvertime = false,
	showNonWorkingLegend = false
): void {
	const legend = container.createDiv({ cls: 'time-tracker-heatmap-legend' });
	legend.createSpan({ text: 'Less', cls: 'time-tracker-heatmap-legend-label' });

	const scheme = HEATMAP_COLOR_SCHEMES[colorScheme] ?? HEATMAP_COLOR_SCHEMES.green;
	const isAccent = colorScheme === 'accent';

	for (let i = 0; i <= 4; i++) {
		const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		box.setAttribute('width', '16');
		box.setAttribute('height', '16');
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('width', '16');
		rect.setAttribute('height', '16');
		rect.setAttribute('rx', '3');

		if (isAccent) {
			rect.setAttribute('class', `time-tracker-heatmap-cell level-${i}`);
		} else {
			rect.setAttribute('class', 'time-tracker-heatmap-cell');
			if (i === 0) {
				rect.style.fill = 'var(--background-modifier-border)';
			} else {
				rect.style.fill = scheme.colors[i - 1];
			}
		}

		box.appendChild(rect);
		legend.appendChild(box);
	}

	legend.createSpan({ text: 'More', cls: 'time-tracker-heatmap-legend-label' });

	// Overtime swatch — only shown when goals are enabled
	if (showOvertime) {
		const separator = legend.createSpan({ cls: 'time-tracker-heatmap-legend-separator' });
		separator.style.width = '8px';

		const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		box.setAttribute('width', '16');
		box.setAttribute('height', '16');
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('width', '16');
		rect.setAttribute('height', '16');
		rect.setAttribute('rx', '3');

		if (isAccent) {
			rect.setAttribute('class', 'time-tracker-heatmap-cell level-5');
		} else {
			rect.setAttribute('class', 'time-tracker-heatmap-cell');
			rect.style.fill = scheme.overtime;
		}

		box.appendChild(rect);
		legend.appendChild(box);
		legend.createSpan({ text: 'Overtime', cls: 'time-tracker-heatmap-legend-label' });
	}

	// Non-working day swatch
	if (showNonWorkingLegend) {
		const separator = legend.createSpan({ cls: 'time-tracker-heatmap-legend-separator' });
		separator.style.width = '8px';

		const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		box.setAttribute('width', '16');
		box.setAttribute('height', '16');

		// Create inline pattern for the legend swatch
		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
		pat.setAttribute('id', 'nw-legend-pattern');
		pat.setAttribute('width', '6');
		pat.setAttribute('height', '6');
		pat.setAttribute('patternUnits', 'userSpaceOnUse');
		pat.setAttribute('patternTransform', 'rotate(45)');

		const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		bg.setAttribute('width', '6');
		bg.setAttribute('height', '6');
		bg.setAttribute('fill', 'var(--background-modifier-border)');
		pat.appendChild(bg);

		const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		line.setAttribute('x1', '0');
		line.setAttribute('y1', '0');
		line.setAttribute('x2', '0');
		line.setAttribute('y2', '6');
		line.setAttribute('stroke', 'var(--background-secondary)');
		line.setAttribute('stroke-width', '2');
		pat.appendChild(line);

		defs.appendChild(pat);
		box.appendChild(defs);

		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('width', '16');
		rect.setAttribute('height', '16');
		rect.setAttribute('rx', '3');
		rect.setAttribute('fill', 'url(#nw-legend-pattern)');

		box.appendChild(rect);
		legend.appendChild(box);
		legend.createSpan({ text: 'Non-working', cls: 'time-tracker-heatmap-legend-label' });
	}
}
