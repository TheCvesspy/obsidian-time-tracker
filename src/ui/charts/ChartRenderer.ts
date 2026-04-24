const PADDING = { top: 20, right: 20, bottom: 40, left: 50 };

/**
 * Hand-picked palette of visually distinct colors for category charts.
 * Chosen for contrast against each other and readability on both light/dark themes.
 */
const DISTINCT_COLORS = [
	'#4e79a7', // steel blue
	'#f28e2b', // orange
	'#e15759', // coral red
	'#76b7b2', // teal
	'#59a14f', // green
	'#edc948', // gold
	'#b07aa1', // mauve
	'#ff9da7', // pink
	'#9c755f', // brown
	'#bab0ac', // warm gray
	'#af7aa1', // plum
	'#86bcb6', // light teal
];

export interface ChartSeries {
	label: string;
	data: number[];
	color: string;
	/** 'smooth' renders without dots and semi-transparent (for moving averages) */
	style?: 'default' | 'smooth';
}

export interface LineChartOptions {
	xLabels: string[];
	yLabel?: string;
	goalLine?: number;
	areaFill?: boolean;
	/** Indices of x-axis points to highlight with a light vertical band (e.g., weekends) */
	highlightIndices?: number[];
}

/**
 * Render a line/area chart on a canvas element.
 */
export function renderLineChart(
	canvas: HTMLCanvasElement,
	series: ChartSeries[],
	options: LineChartOptions
): void {
	const dpr = window.devicePixelRatio || 1;
	const displayWidth = canvas.clientWidth || 560;
	const displayHeight = canvas.clientHeight || 200;

	canvas.width = displayWidth * dpr;
	canvas.height = displayHeight * dpr;
	canvas.style.width = `${displayWidth}px`;
	canvas.style.height = `${displayHeight}px`;

	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);

	const chartWidth = displayWidth - PADDING.left - PADDING.right;
	const chartHeight = displayHeight - PADDING.top - PADDING.bottom;

	// Find max Y value
	let maxY = 0;
	for (const s of series) {
		for (const v of s.data) {
			maxY = Math.max(maxY, v);
		}
	}
	if (options.goalLine && options.goalLine > maxY) {
		maxY = options.goalLine;
	}
	maxY = Math.ceil(maxY * 1.1) || 1; // 10% headroom

	const xCount = options.xLabels.length;
	if (xCount === 0) return;

	// Draw gridlines and Y-axis labels
	const gridColor = getComputedColor('--background-modifier-border', '#333');
	const textColor = getComputedColor('--text-muted', '#888');

	ctx.strokeStyle = gridColor;
	ctx.lineWidth = 0.5;
	ctx.fillStyle = textColor;
	ctx.font = '10px sans-serif';
	ctx.textAlign = 'right';

	const yTicks = 5;
	for (let i = 0; i <= yTicks; i++) {
		const y = PADDING.top + chartHeight - (i / yTicks) * chartHeight;
		const val = Math.round((i / yTicks) * maxY * 10) / 10;

		ctx.beginPath();
		ctx.moveTo(PADDING.left, y);
		ctx.lineTo(PADDING.left + chartWidth, y);
		ctx.stroke();

		ctx.fillText(`${val}h`, PADDING.left - 6, y + 3);
	}

	// Draw X-axis labels (thin them out for large datasets)
	ctx.textAlign = 'center';
	const labelStep = Math.max(1, Math.ceil(xCount / 12));

	for (let i = 0; i < xCount; i += labelStep) {
		const x = PADDING.left + (i / Math.max(xCount - 1, 1)) * chartWidth;
		ctx.fillText(options.xLabels[i], x, displayHeight - PADDING.bottom + 16);
	}

	// Draw goal line
	if (options.goalLine) {
		const goalY = PADDING.top + chartHeight - (options.goalLine / maxY) * chartHeight;
		ctx.strokeStyle = getComputedColor('--text-muted', '#888');
		ctx.lineWidth = 1;
		ctx.setLineDash([4, 4]);
		ctx.beginPath();
		ctx.moveTo(PADDING.left, goalY);
		ctx.lineTo(PADDING.left + chartWidth, goalY);
		ctx.stroke();
		ctx.setLineDash([]);

		ctx.fillStyle = textColor;
		ctx.textAlign = 'left';
		ctx.fillText(`Goal: ${options.goalLine}h`, PADDING.left + chartWidth + 2, goalY + 3);
		ctx.textAlign = 'center';
	}

	// Draw highlight bands (e.g., weekends)
	if (options.highlightIndices && options.highlightIndices.length > 0) {
		ctx.fillStyle = 'rgba(128, 128, 128, 0.07)';
		const step = xCount > 1 ? chartWidth / (xCount - 1) : chartWidth;
		const halfStep = step / 2;
		for (const idx of options.highlightIndices) {
			const x = PADDING.left + (idx / Math.max(xCount - 1, 1)) * chartWidth;
			ctx.fillRect(x - halfStep, PADDING.top, step, chartHeight);
		}
	}

	// Draw series
	for (const s of series) {
		if (s.data.length === 0) continue;

		const points: [number, number][] = s.data.map((val, i) => {
			const x = PADDING.left + (i / Math.max(xCount - 1, 1)) * chartWidth;
			const y = PADDING.top + chartHeight - (val / maxY) * chartHeight;
			return [x, y];
		});

		const isSmooth = s.style === 'smooth';

		// Area fill (skip for smooth/moving-average lines)
		if (options.areaFill && !isSmooth) {
			ctx.beginPath();
			ctx.moveTo(points[0][0], PADDING.top + chartHeight);
			for (const [x, y] of points) {
				ctx.lineTo(x, y);
			}
			ctx.lineTo(points[points.length - 1][0], PADDING.top + chartHeight);
			ctx.closePath();
			ctx.fillStyle = hexToRgba(s.color, 0.15);
			ctx.fill();
		}

		// Line
		const prevAlpha = ctx.globalAlpha;
		if (isSmooth) ctx.globalAlpha = 0.6;
		ctx.beginPath();
		ctx.moveTo(points[0][0], points[0][1]);
		for (let i = 1; i < points.length; i++) {
			ctx.lineTo(points[i][0], points[i][1]);
		}
		ctx.strokeStyle = s.color;
		ctx.lineWidth = isSmooth ? 2.5 : 2;
		ctx.stroke();
		ctx.globalAlpha = prevAlpha;

		// Dots (skip for smooth style)
		if (!isSmooth) {
			for (const [x, y] of points) {
				ctx.beginPath();
				ctx.arc(x, y, 3, 0, Math.PI * 2);
				ctx.fillStyle = s.color;
				ctx.fill();
			}
		}
	}
}

/**
 * Render a stacked area chart on a canvas element.
 */
export function renderStackedAreaChart(
	canvas: HTMLCanvasElement,
	series: ChartSeries[],
	xLabels: string[]
): void {
	const dpr = window.devicePixelRatio || 1;
	const displayWidth = canvas.clientWidth || 560;
	const displayHeight = canvas.clientHeight || 200;

	canvas.width = displayWidth * dpr;
	canvas.height = displayHeight * dpr;
	canvas.style.width = `${displayWidth}px`;
	canvas.style.height = `${displayHeight}px`;

	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);

	const chartWidth = displayWidth - PADDING.left - PADDING.right;
	const chartHeight = displayHeight - PADDING.top - PADDING.bottom;

	const xCount = xLabels.length;
	if (xCount === 0 || series.length === 0) return;

	// Calculate stacked totals to find maxY
	const stackedTotals = new Array(xCount).fill(0);
	for (const s of series) {
		for (let i = 0; i < xCount; i++) {
			stackedTotals[i] += s.data[i] || 0;
		}
	}
	let maxY = Math.ceil(Math.max(...stackedTotals) * 1.1) || 1;

	// Grid
	const gridColor = getComputedColor('--background-modifier-border', '#333');
	const textColor = getComputedColor('--text-muted', '#888');

	ctx.strokeStyle = gridColor;
	ctx.lineWidth = 0.5;
	ctx.fillStyle = textColor;
	ctx.font = '10px sans-serif';
	ctx.textAlign = 'right';

	const yTicks = 5;
	for (let i = 0; i <= yTicks; i++) {
		const y = PADDING.top + chartHeight - (i / yTicks) * chartHeight;
		const val = Math.round((i / yTicks) * maxY * 10) / 10;
		ctx.beginPath();
		ctx.moveTo(PADDING.left, y);
		ctx.lineTo(PADDING.left + chartWidth, y);
		ctx.stroke();
		ctx.fillText(`${val}h`, PADDING.left - 6, y + 3);
	}

	// X labels
	ctx.textAlign = 'center';
	const labelStep = Math.max(1, Math.ceil(xCount / 12));
	for (let i = 0; i < xCount; i += labelStep) {
		const x = PADDING.left + (i / Math.max(xCount - 1, 1)) * chartWidth;
		ctx.fillText(xLabels[i], x, displayHeight - PADDING.bottom + 16);
	}

	// Draw stacked areas (bottom to top)
	const baseline = new Array(xCount).fill(0);

	for (const s of series) {
		const topPoints: [number, number][] = [];
		const bottomPoints: [number, number][] = [];

		for (let i = 0; i < xCount; i++) {
			const x = PADDING.left + (i / Math.max(xCount - 1, 1)) * chartWidth;
			const bottomY = PADDING.top + chartHeight - (baseline[i] / maxY) * chartHeight;
			const topY = PADDING.top + chartHeight - ((baseline[i] + (s.data[i] || 0)) / maxY) * chartHeight;
			topPoints.push([x, topY]);
			bottomPoints.push([x, bottomY]);
		}

		// Fill area
		ctx.beginPath();
		ctx.moveTo(bottomPoints[0][0], bottomPoints[0][1]);
		for (const [x, y] of topPoints) {
			ctx.lineTo(x, y);
		}
		for (let i = bottomPoints.length - 1; i >= 0; i--) {
			ctx.lineTo(bottomPoints[i][0], bottomPoints[i][1]);
		}
		ctx.closePath();
		ctx.fillStyle = hexToRgba(s.color, 0.75);
		ctx.fill();

		// Line on top
		ctx.beginPath();
		ctx.moveTo(topPoints[0][0], topPoints[0][1]);
		for (let i = 1; i < topPoints.length; i++) {
			ctx.lineTo(topPoints[i][0], topPoints[i][1]);
		}
		ctx.strokeStyle = s.color;
		ctx.lineWidth = 2;
		ctx.stroke();

		// Update baseline
		for (let i = 0; i < xCount; i++) {
			baseline[i] += s.data[i] || 0;
		}
	}
}

/**
 * Generate a palette of N visually distinct colors.
 * Uses hand-picked colors first for maximum contrast, then falls back to
 * hue rotation from the accent color for overflow categories.
 */
export function generatePalette(accentHex: string, count: number): string[] {
	if (count <= 0) return [];
	const colors: string[] = [];

	for (let i = 0; i < count; i++) {
		if (i < DISTINCT_COLORS.length) {
			colors.push(DISTINCT_COLORS[i]);
		} else {
			// Fallback: rotate hue from accent for any overflow categories
			const [h, s, l] = hexToHsl(accentHex);
			const hue = (h + ((i - DISTINCT_COLORS.length) * 137.5)) % 360; // golden angle for spread
			colors.push(hslToHex(hue, Math.max(s, 50), Math.min(Math.max(l, 40), 60)));
		}
	}
	return colors;
}

function getComputedColor(cssVar: string, fallback: string): string {
	const val = getComputedStyle(document.body).getPropertyValue(cssVar)?.trim();
	return val || fallback;
}

function hexToRgba(hex: string, alpha: number): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hexToHsl(hex: string): [number, number, number] {
	let r = parseInt(hex.slice(1, 3), 16) / 255;
	let g = parseInt(hex.slice(3, 5), 16) / 255;
	let b = parseInt(hex.slice(5, 7), 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	let h = 0, s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
		else if (max === g) h = ((b - r) / d + 2) * 60;
		else h = ((r - g) / d + 4) * 60;
	}

	return [h, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
	s /= 100;
	l /= 100;
	const a = s * Math.min(l, 1 - l);
	const f = (n: number) => {
		const k = (n + h / 30) % 12;
		const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
		return Math.round(255 * color).toString(16).padStart(2, '0');
	};
	return `#${f(0)}${f(8)}${f(4)}`;
}
