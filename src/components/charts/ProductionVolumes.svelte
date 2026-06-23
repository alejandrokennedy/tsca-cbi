<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import {
		Line,
		Plot,
		AreaY,
		Pointer,
		Dot,
		RuleX,
		HTMLTooltip
	} from "svelteplot";
	import { autoType, format } from "d3";
	import volumesRaw from "$data/six-chemicals-production-volumes.csv";

	// One row of six-chemicals-production-volumes.csv (post-autoType).
	// `category` distinguishes the three series: the combined reported use
	// (industry + consumer) and the low/high production-volume bounds.
	type VolumeRow = {
		year: number;
		volume: number;
		category: "reported" | "low" | "high";
		chemical: string;
		date: Date;
	};

	// Wide "band" row: one per year carrying both production-volume bounds, so
	// AreaY can draw a single low→high band (its y1/y2 channels each need one
	// value per x — they can't pull two rows out of the long-format data).
	type BandRow = { year: number; date: Date; low: number; high: number };

	// One small-multiple panel: a chemical plus the data the marks need.
	type Panel = {
		chemical: string;
		rows: VolumeRow[]; // all three series, long form (lines + pointer + tooltip)
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

	const BAND_COLOR = "#9498a0";
	// Categorical color scale shared by the lines, the hover dot, and the tooltip
	// swatch. NB: SveltePlot's categorical color scale ignores `range` and falls
	// back to observable10 — pass the palette as `scheme` instead (see
	// svelteplot-categorical-color memory). We reuse the same domain/scheme to
	// build `colorOf` so swatch = dot = line.
	const CATEGORIES = ["reported", "low", "high"] as const;
	const CAT_COLORS = ["#4269d0", "#6cc5b0", "#ff725c"];
	const colorOf = new Map(CATEGORIES.map((c, i) => [c, CAT_COLORS[i]]));
	const CAT_LABEL: Record<VolumeRow["category"], string> = {
		reported: "Reported use (industry + consumer)",
		low: "Est. production volume — low",
		high: "Est. production volume — high"
	};

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
		const band: BandRow[] = years.map((year) => ({
			year,
			date: new Date(year, 0, 1),
			low: rows.find((d) => d.year === year && d.category === "low")!.volume,
			high: rows.find((d) => d.year === year && d.category === "high")!.volume
		}));
		const max = Math.max(...rows.map((d) => d.volume));
		return { chemical, rows, band, max };
	});
	console.log("panels", panels);

	// x-axis (year) extent, shared by every panel — used to flip the tooltip near
	// the left/right edges.
	const yearMin = Math.min(...volumes.map((d) => d.year));
	const yearMax = Math.max(...volumes.map((d) => d.year));

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
		{#each CATEGORIES as cat (cat)}
			<span class="key">
				<span class="swatch line" style:background={colorOf.get(cat)}></span>
				{CAT_LABEL[cat]}
			</span>
		{/each}
		<span class="key">
			<span class="swatch band" style:background={BAND_COLOR}></span>
			Shaded = low–high range
		</span>
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
							marginLeft={48}
							grid
							x={{ label: null }}
							y={{ tickFormat: fmtTick, zero: true }}
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
							<!-- Three lines (reported / low / high) from the long data,
						     grouped + colored by category via the shared scale. -->
							<Line
								data={panel.rows}
								x="date"
								y="volume"
								z="category"
								stroke="category"
								strokeWidth={2}
							/>

							<!-- Hover marker. Pointer finds the single datum nearest the
						     cursor — no `z`, so it searches one shared tree across all
						     three series (matching the tooltip) — and draws a faint
						     rule at that year plus a dot on the line, colored by the
						     same category scale. -->
							<Pointer data={panel.rows} x="date" y="volume" maxDistance={25}>
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
									data={panel.rows}
									x="date"
									y={(d: VolumeRow) => d.volume || 1e-9}
								>
									{#snippet children({ datum })}
										{#if datum}
											<div
												class="cbi-tooltip"
												style:transform={tipTransform(
													(datum.year - yearMin) / (yearMax - yearMin),
													datum.volume / panel.max
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
													<span class="tt-num">{fmtFull(datum.volume)} lb</span>
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

	.swatch.band {
		height: 12px;
		opacity: 0.4;
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
