<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import {
		Line,
		Plot,
		AreaY,
		Pointer,
		Dot,
		RuleX,
		Contour,
		HTMLTooltip
	} from "svelteplot";
	import { autoType, format } from "d3";
	import volumesRaw from "$data/four-chemicals-production-volumes.csv";

	// One row of six-chemicals-production-volumes.csv (post-autoType).
	// `category` distinguishes the three series: the combined reported use
	// (industry + consumer) and the low/high production-volume bounds.
	type VolumeRow = {
		year: number;
		volume: number;
		// "average" rows aren't in the CSV — they're synthesized per panel (the
		// low/high midpoint) so the average line participates in hover/tooltip search.
		category: "reported" | "low" | "high" | "average";
		chemical: string;
		date: Date;
	};

	// Wide "band" row: one per year carrying both production-volume bounds, so
	// AreaY can draw a single low→high band (its y1/y2 channels each need one
	// value per x — they can't pull two rows out of the long-format data).
	type BandRow = {
		year: number;
		date: Date;
		low: number;
		high: number;
		avg: number; // midpoint of low/high — the optional average line
		reported: number; // reported use that year — y-bound of the teal gap area
	};

	// One small-multiple panel: a chemical plus the data the marks need.
	type Panel = {
		chemical: string;
		rows: VolumeRow[]; // all three series, long form (lines)
		hoverRows: VolumeRow[]; // rows + a synthetic "average" series (pointer + tooltip)
		band: BandRow[]; // pivoted low/high bounds for the AreaY band
		max: number; // largest volume in the panel — drives the auto y-domain,
		// used to flip the tooltip when a hovered point is near the top
	};

	const MOBILE_BREAKPOINT = 768;
	// Sticky site header height (mirrors story.svelte's HEADER_H). Subtracted
	// from the 100dvh panes below so a "full screen" chart fits *under* the
	// header instead of overflowing it.
	const HEADER_H = { mobile: 48, desktop: 65 };
	const FOOTER_H = 54.6;
	// Height of the title rendered by AEM (the CMS hosting this Svelte component),
	// which sits *above* this component. Reserve room for it — folded into
	// --header-h below — so the title + chart(s) fit together on screen: desktop
	// subtracts it from the 95dvh figure, mobile from each 100dvh pane.
	const AEM_TITLE_H = 100;

	// Production-range visuals — all gray.
	const BAND_COLOR = "#9498a0"; // shaded low→high band
	const RANGE_LINE_COLOR = "#ccc"; // the low & high bound lines
	// The reported-use line, pulled out as its own variable so it's easy to swap.
	const REPORTED_COLOR = "#FF2D65";
	// const REPORTED_COLOR = "#E92458";
	// const REPORTED_COLOR = "#3066BE";
	// const REPORTED_COLOR = "#05668D";
	const AVG_COLOR = "#999"; // the average-estimate line + its hover dot/swatch

	// Categorical color scale — the single source of truth shared by the lines,
	// the hover dot, the legend swatches, and the tooltip swatch (so swatch = dot
	// = line). low & high both use the gray range color; "average" is a synthetic
	// hover-only series (see VolumeRow). NB: SveltePlot's categorical color scale
	// ignores `range` and falls back to observable10 — pass the palette as `scheme`
	// instead (see svelteplot-categorical-color memory).
	const CATEGORIES = ["reported", "low", "high", "average"] as const;
	const CAT_COLORS = [
		REPORTED_COLOR,
		RANGE_LINE_COLOR,
		RANGE_LINE_COLOR,
		AVG_COLOR
	];
	const colorOf = new Map(CATEGORIES.map((c, i) => [c, CAT_COLORS[i]]));
	const CAT_LABEL: Record<VolumeRow["category"], string> = {
		reported: "Reported use (industry + consumer)",
		low: "Nationally aggregated production volume — low",
		high: "Nationally aggregated production volume — high",
		average: "Nationally aggregated production volume — midpoint"
	};

	// Legend line entries. The low & high bounds share one gray color, so they
	// collapse into a single key here (CAT_LABEL above stays per-category for the
	// tooltip, which names the specific bound hovered).
	const LEGEND = [
		{ color: REPORTED_COLOR, label: CAT_LABEL.reported },
		{
			color: RANGE_LINE_COLOR,
			label: "Nationally aggregated production volume low/high bounds"
		}
	];

	// Compact y-axis ticks (e.g. 226M instead of 226,796,185) so the free,
	// per-chemical scales stay legible in a narrow panel. The tooltip uses the
	// fully-grouped form for precision.
	const fmtTick = format("~s");
	const fmtFull = format(",.0f");

	// dsv returns string-valued rows; d3's autoType coerces each field to its
	// natural type (numbers for year/volume, strings for category/chemical).
	// We also add a `date` (Jan 1 of `year`) for the time axis.
	// autoType mutates its argument, so clone each row first — volumesRaw is a
	// shared module-cached import and the component <script> re-runs per render
	// (calling autoType on already-coerced numbers throws ".trim is not a function").
	const volumes: VolumeRow[] = volumesRaw.map((d: Record<string, string>) => {
		const row = autoType({ ...d }) as VolumeRow;
		row.category = row.category.trim() as VolumeRow["category"];
		row.date = new Date(row.year, 0, 1);
		return row;
	});

	// Build one panel per chemical (preserving first-seen order). `rows` is the
	// long form sorted by category then year — Line groups series with a
	// *sequential* scan (new line when the z value changes), so each category
	// must be contiguous and year-ascending. `band` pivots low/high to wide.
	const chemicals = [...new Set(volumes.map((d) => d.chemical))];
	const panels: Panel[] = chemicals.map((chemical) => {
		const rows = volumes
			.filter((d) => d.chemical === chemical)
			.sort((a, b) => a.category.localeCompare(b.category) || a.year - b.year);
		const years = [...new Set(rows.map((d) => d.year))].sort((a, b) => a - b);
		const band: BandRow[] = years.map((year) => {
			const low = rows.find(
				(d) => d.year === year && d.category === "low"
			)!.volume;
			const high = rows.find(
				(d) => d.year === year && d.category === "high"
			)!.volume;
			const reported =
				rows.find((d) => d.year === year && d.category === "reported")
					?.volume ?? 0;
			return {
				year,
				date: new Date(year, 0, 1),
				low,
				high,
				avg: (low + high) / 2,
				reported
			};
		});
		const max = Math.max(...rows.map((d) => d.volume));
		// Synthetic "average" series (low/high midpoint) so the average line is
		// hittable by the pointer/tooltip. Hover-only — not fed to the Line marks,
		// so the dashed average line isn't duplicated.
		const avgRows: VolumeRow[] = band.map((b) => ({
			year: b.year,
			volume: b.avg,
			category: "average",
			chemical,
			date: b.date
		}));
		const hoverRows = [...rows, ...avgRows];
		return { chemical, rows, hoverRows, band, max };
	});
	console.log("panels", panels);

	// ── Y-axis scale mode ─────────────────────────────────────────────────────
	// true  = absolute: every panel shares one [0, globalMax] domain, so panel
	//         heights are directly comparable across chemicals.
	// false = relative: each panel auto-scales to its own data (its own max).
	// Flip this one flag to switch between the two.
	const ABSOLUTE_SCALE = false;
	// Largest volume across all panels — the shared y-max in absolute mode.
	const globalMax = Math.max(...panels.map((p) => p.max));

	// Show a dashed line at the midpoint between the low and high bounds.
	// (AVG_COLOR is defined up with the other color constants.)
	const SHOW_AVERAGE = true;
	// Shaded area spanning the gap between the reported line and the average.
	const GAP_COLOR = "teal";

	// Filled grayscale contour bands around the average line. The scalar field is
	// "closeness" to the average: 1 on the average line, 0 on the low/high bounds
	// (see bandFieldAt). A filled contour at threshold t covers the central region
	// where closeness ≥ t — i.e. within (1−t) of the half-width of the average — so
	// smaller thresholds give wider regions. We render one filled Contour per band
	// from the outside in; painter's order then paints clean nested bands. The
	// outermost band (threshold 0) reaches closeness 0, so it touches the low/high
	// lines exactly; the innermost hugs the average. Grayscale, lightest outside →
	// darkest inside. (fill="value" would route through the plot's color scale, but
	// that scale is the categorical line palette — so we set explicit grays here.)
	const CONTOUR_BAND_COUNT = 3;
	const CONTOUR_BANDS = Array.from({ length: CONTOUR_BAND_COUNT }, (_, k) => {
		const t = k / CONTOUR_BAND_COUNT; // closeness threshold: 0 (outer) … →1 (inner)
		const f = k / (CONTOUR_BAND_COUNT - 1); // 0 (outer) … 1 (inner)
		const L = 92 - f * 10; // lightness: 88% (outer, lightest) → 40% (inner, darkest)
		return { t, fill: `hsl(0, 0%, ${L}%)` };
	});

	// Multi-shade legend swatch: the band's low→high cross-section flattened into a
	// row of hard-edged stripes — lightest at both ends (the low/high bounds),
	// darkest in the middle (the average). Mirrors CONTOUR_BANDS (outer→inner) then
	// back, dropping the duplicate dark center, so it tracks any band-count/shade
	// change automatically.
	const SHADE_STRIPES = [
		...CONTOUR_BANDS,
		...CONTOUR_BANDS.slice(0, -1).reverse()
	].map((b) => b.fill);
	const SHADE_SWATCH = `linear-gradient(to right, ${SHADE_STRIPES.map(
		(c, i) =>
			`${c} ${(i / SHADE_STRIPES.length) * 100}% ${((i + 1) / SHADE_STRIPES.length) * 100}%`
	).join(", ")})`;
	// ──────────────────────────────────────────────────────────────────────────

	// x-axis (year) extent, shared by every panel — used to flip the tooltip near
	// the left/right edges.
	const yearMin = Math.min(...volumes.map((d) => d.year));
	const yearMax = Math.max(...volumes.map((d) => d.year));

	// Date extent — the data-space x bounds handed to the contour sampler (which
	// maps its pixel grid linearly onto [X_MIN_DATE, X_MAX_DATE], the same range the
	// plot's time scale spans, so the rings line up with the lines). These MUST be
	// Date objects, not timestamps: the contour registers x1/x2 into the plot's
	// x-scale domain, and a numeric value there makes SveltePlot infer a linear
	// (raw-millisecond) axis instead of a time (year) axis.
	const X_MIN_DATE = new Date(yearMin, 0, 1);
	const X_MAX_DATE = new Date(yearMax, 0, 1);

	// Continuous (avg, half-width) of the low→high band at an arbitrary x (a
	// timestamp), linearly interpolated between the discrete yearly band rows.
	// The contour scalar field is closeness to the average,
	// 1 − |y − avg(x)| / half(x): 1 on the average line, 0 on the low/high bounds
	// (computed at the call site). `band` is already sorted year-ascending.
	function bandFieldAt(
		band: BandRow[],
		x: number
	): { avg: number; half: number } {
		const first = band[0];
		const last = band[band.length - 1];
		if (x <= +first.date)
			return { avg: first.avg, half: (first.high - first.low) / 2 };
		if (x >= +last.date)
			return { avg: last.avg, half: (last.high - last.low) / 2 };
		for (let i = 0; i < band.length - 1; i++) {
			const a = band[i];
			const b = band[i + 1];
			const ax = +a.date;
			const bx = +b.date;
			if (x >= ax && x <= bx) {
				const f = (x - ax) / (bx - ax);
				const ha = (a.high - a.low) / 2;
				const hb = (b.high - b.low) / 2;
				return { avg: a.avg + f * (b.avg - a.avg), half: ha + f * (hb - ha) };
			}
		}
		return { avg: last.avg, half: (last.high - last.low) / 2 };
	}

	// Edge-aware tooltip transform. HTMLTooltip anchors our box's origin at the
	// hovered point; this floats it centered-above by default, but flips it below
	// when the point is near the top (xFrac/yFrac are 0..1 within the data extent)
	// and left/right-aligns it near the horizontal edges, so it never clips.
	function tipTransform(xFrac: number, yFrac: number) {
		const ty = yFrac > 0.8 ? "12px" : "calc(-100% - 12px)";
		const tx = xFrac < 0.12 ? "0%" : xFrac > 0.88 ? "-100%" : "-50%";
		return `translate(${tx}, ${ty})`;
	}

	let rootW = $state(1024);
	let isMobile = $derived(rootW <= MOBILE_BREAKPOINT);
	let headerH = $derived(isMobile ? HEADER_H.mobile : HEADER_H.desktop);
	let footerH = $derived(footerState.visible ? FOOTER_H : 0);

	// Per-panel measured height (one entry per panel) so each Plot can size its
	// SVG to its grid cell. All cells are equal, but binding each keeps it robust
	// to layout changes.
	let panelH = $state<number[]>([]);

	// Grid shape adapts to the chemical count so swapping the dataset (e.g. 6 → 4)
	// reflows cleanly instead of leaving empty cells: ≤4 panels use 2 columns
	// (a tidy 2×2), more use 3. Mobile is always 2 columns; its rows auto-size
	// and the page scrolls, so `rows` only matters on desktop.
	let cols = $derived(isMobile ? 2 : panels.length <= 4 ? 2 : 3);
	let rows = $derived(Math.ceil(panels.length / cols));
</script>

<div
	class="chart"
	class:mobile={isMobile}
	bind:clientWidth={rootW}
	style:--header-h={`${headerH}px - ${footerH}px - ${AEM_TITLE_H}px`}
>
	<!-- <div class="chart-title">Production Volumes by Chemical</div> -->

	<!-- Shared key: the three line series + the shaded band. -->
	<div class="legend">
		{#each LEGEND as entry (entry.label)}
			<span class="key">
				<span class="swatch line" style:background={entry.color}></span>
				{entry.label}
			</span>
		{/each}
		{#if SHOW_AVERAGE}
			<span class="key">
				<span class="swatch line dashed" style:color={AVG_COLOR}></span>
				Nationally aggregated production volume — midpoint
			</span>
		{/if}
		<span class="key">
			<span class="swatch shades" style:background={SHADE_SWATCH}></span>
			Shaded = low–high range
		</span>
		<!-- <span class="key">
			<span class="swatch band" style:background={GAP_COLOR} style:opacity={0.5}
			></span>
			Reported-to-average gap
		</span> -->
	</div>

	<div class="grid" style:--cols={cols} style:--rows={rows}>
		{#each panels as panel, i (panel.chemical)}
			<div class="panel">
				<div class="panel-title">{panel.chemical}</div>
				<div class="chart-area" bind:clientHeight={panelH[i]}>
					<!-- Only render once the cell is measured tall enough: a 0/tiny
					     height yields a negative plot-body height and SveltePlot throws
					     `<rect height="-…">`. -->
					{#if (panelH[i] ?? 0) >= 80}
						<Plot
							height={panelH[i]}
							marginLeft={40}
							marginRight={18}
							grid
							x={{ label: null }}
							y={{
								tickFormat: fmtTick,
								zero: true,
								...(ABSOLUTE_SCALE ? { domain: [0, globalMax] } : {})
							}}
							color={{ domain: [...CATEGORIES], scheme: CAT_COLORS }}
						>
							<!-- y={{ type: "log" }} -->
							<AreaY
								data={panel.band}
								x="date"
								y1="low"
								y2="high"
								fill={BAND_COLOR}
								fillOpacity={0.18}
							/>
							<!-- Filled grayscale contour bands around the average.
						     Function-sampling mode: no data, the closeness field is
						     sampled on a pixel grid mapped onto
						     [X_MIN_TS, X_MAX_TS] × [panel.max, 0] (the plot's own x/y
						     domain, since zero:true and no nice → exact overlay). One
						     filled Contour per band, outermost (lightest, touching the
						     low/high lines) first so painter's order nests them, darkest
						     hugging the average. -->
							{#each CONTOUR_BANDS as band (band.t)}
								<Contour
									x1={X_MIN_DATE as unknown as number}
									x2={X_MAX_DATE as unknown as number}
									y1={ABSOLUTE_SCALE ? globalMax : panel.max}
									y2={0}
									value={(x, y) => {
										// x arrives as a Date (the sampler interpolates the
										// Date-valued x bounds); coerce to a timestamp.
										const { avg, half } = bandFieldAt(panel.band, +x);
										return half > 0 ? 1 - Math.abs(y - avg) / half : -999;
									}}
									thresholds={[band.t]}
									fill={band.fill}
								/>
							{/each}
							<!-- Teal gap: the spread between reported use and the average
						     estimate. Drawn after the bands so it stays visible on top. -->
							<!-- <AreaY
								data={panel.band}
								x="date"
								y1="reported"
								y2="avg"
								fill={GAP_COLOR}
								fillOpacity={0.1}
							/> -->
							<!-- Optional dashed midpoint between the low/high bounds. -->
							{#if SHOW_AVERAGE}
								<Line
									data={panel.band}
									x="date"
									y="avg"
									stroke={AVG_COLOR}
									strokeWidth={2}
									strokeDasharray="4,3"
								/>
							{/if}
							<!-- Three lines (reported / low / high) from the long data,
						     grouped + colored by category via the shared scale. -->
							<Line
								data={panel.rows}
								x="date"
								y="volume"
								z="category"
								strokeWidth={(d) => (d.category === "reported" ? 2 : 1.5)}
								stroke={(d) =>
									d.category === "reported" ? REPORTED_COLOR : RANGE_LINE_COLOR}
							/>
							<!-- strokeWidth={2} -->

							<!-- Hover marker. Pointer finds the single datum nearest the
						     cursor — no `z`, so it searches one shared tree across all
						     four series (reported/low/high + the synthetic average,
						     matching the tooltip) — and draws a faint rule at that year
						     plus a dot on the line, colored by the same category scale. -->
							<Pointer
								data={panel.hoverRows}
								x="date"
								y="volume"
								maxDistance={25}
							>
								{#snippet children({ data: hit })}
									<RuleX
										data={hit}
										x="date"
										stroke="currentColor"
										strokeOpacity={0.25}
									/>
									<Dot
										data={hit}
										x="date"
										y="volume"
										fill="category"
										stroke="var(--svelteplot-bg, white)"
										strokeWidth={1.5}
										r={4.5}
									/>
								{/snippet}
							</Pointer>

							<!-- HTML tooltip box, required in the `overlay` snippet. It runs
						     its own nearest-point search (also ignoring `z`), staying in
						     sync with the Pointer above. `y` uses `volume || 1e-9` only
						     for box *placement*: SveltePlot guards tooltipY with
						     truthiness, so a literal 0 (1-Bromopropane's reported series)
						     collapses `top` to 0 and the box is clipped away by
						     `overflow: hidden`. The epsilon is sub-pixel once projected;
						     `datum` is the full row, so the displayed value is the real 0.
						     (See svelteplot-htmltooltip-zero-bug memory.) -->
							{#snippet overlay()}
								<HTMLTooltip
									data={panel.hoverRows}
									x="date"
									y={(d: VolumeRow) => d.volume || 1e-9}
								>
									{#snippet children({ datum })}
										{#if datum}
											<div
												class="cbi-tooltip"
												style:transform={tipTransform(
													(datum.year - yearMin) / (yearMax - yearMin),
													datum.volume /
														(ABSOLUTE_SCALE ? globalMax : panel.max)
												)}
											>
												<div class="tt-name">
													<span
														class="tt-swatch"
														style:background={colorOf.get(datum.category)}
													></span>
													{CAT_LABEL[datum.category as VolumeRow["category"]]}
												</div>
												<div class="tt-row">
													<span>{datum.year}</span>
													<span class="tt-num">{fmtFull(datum.volume)} kg</span>
												</div>
											</div>
										{/if}
									{/snippet}
								</HTMLTooltip>
							{/snippet}
						</Plot>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.chart {
		display: flex;
		flex-direction: column;
		padding: 0rem 0.5rem;
		box-sizing: border-box;
		font-family: Helvetica, Arial, sans-serif;
	}

	.chart:not(.mobile) {
		height: calc(95dvh - var(--header-h));
	}

	.chart-title {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.2;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin: 0.25rem 0 0.5rem;
		font-size: 12px;
	}

	.key {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}

	.swatch {
		display: inline-block;
		width: 14px;
	}

	.swatch.line {
		height: 3px;
	}

	/* Dashed midpoint swatch: dashes painted with a gradient (matching the line's
	   4,3 dasharray) using inline `color`, since the solid swatches set `background`
	   inline and would otherwise override any pattern here. */
	.swatch.line.dashed {
		height: 2px;
		background: repeating-linear-gradient(
			to right,
			currentColor 0 4px,
			transparent 4px 7px
		);
	}

	.swatch.band {
		height: 12px;
		opacity: 0.4;
	}

	/* Multi-shade band swatch: full opacity (the gradient already holds the real
	   band colors) with a hairline border so the near-white outer stripes read
	   against the legend background. */
	.swatch.shades {
		width: 21px; /* 1.5× the base 14px swatch width */
		height: 12px;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 2px;
	}

	/* Small multiples. Column/row counts come from --cols/--rows (set inline,
	   derived from the chemical count) so the layout reflows when the dataset
	   changes — e.g. 6 → 2×3, 4 → 2×2. */
	.grid {
		flex: 1 1 0;
		min-height: 0;
		display: grid;
		gap: 0.5rem 1rem;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: repeat(var(--rows), 1fr);
	}

	/* Mobile: the .chart has no fixed height (each panel is read on its own as
	   the page scrolls), so the grid can't flex against a container height —
	   that collapses every cell to ~0 and SveltePlot throws on the negative
	   plot height. Instead give the rows an explicit viewport-relative height
	   and let the grid grow past the screen (the page scrolls). */
	.chart.mobile .grid {
		flex: none;
		grid-template-columns: repeat(var(--cols), 1fr);
		grid-template-rows: none;
		grid-auto-rows: 42dvh;
		gap: 0.5rem 0.1rem;
	}

	.panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		box-sizing: border-box;
	}

	.panel-title {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		line-height: 1.2;
	}

	.chart-area {
		flex: 1 1 0;
		min-height: 0;
		overflow: hidden;
	}

	/* Tooltip box. HTMLTooltip anchors its wrapper's top-left at the hovered
	   point; the `transform` is set inline (see tipTransform) so it can flip
	   away from the top/left/right edges instead of clipping. */
	.cbi-tooltip {
		background: #fff;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		padding: 6px 9px;
		font-size: 12px;
		line-height: 1.3;
		white-space: nowrap;
		pointer-events: none;
	}

	.tt-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		margin-bottom: 2px;
	}

	.tt-swatch {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}

	.tt-row {
		display: flex;
		justify-content: space-between;
		gap: 0.75em;
		opacity: 0.85;
	}

	.tt-num {
		font-variant-numeric: tabular-nums;
	}
</style>
