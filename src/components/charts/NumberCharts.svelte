<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import { Plot, Line, Pointer, Dot, RuleX, HTMLTooltip } from "svelteplot";
	import consumerRaw from "$data/consumerData.csv";
	import industryRaw from "$data/industryData.csv";

	const MOBILE_BREAKPOINT = 768;
	// Sticky site header height (mirrors story.svelte's HEADER_H). Subtracted
	// from the 100dvh panes below so a "full screen" chart fits *under* the
	// header instead of overflowing it.
	const HEADER_H = { mobile: 48, desktop: 65 };
	const FOOTER_H = 54.6;
	const Y_MAX = 70;
	const LEGEND_GAP = 16; // px between chart and right-side legend (desktop)

	// The dsv plugin returns string-valued rows (coercion now lives here, not in
	// vite.config.js); cast `num`/`perc` and add a `date` for the time axis.
	function toSeries(rows: any[]) {
		return rows
			.map((d) => ({
				name: d.name,
				longName: d.longName.trim(),
				year: +d.year,
				num: +d.num,
				perc: +d.perc,
				date: new Date(+d.year, 0, 1)
			}))
			.sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year);
	}

	const consumer = toSeries(consumerRaw);
	const industry = toSeries(industryRaw);

	// Explicit categorical color scale, shared by both panes. SveltePlot's
	// default scheme (observable10) only has 10 colors, but we plot 11 chemicals,
	// so two would otherwise collide. We pin the domain to the union of chemicals
	// (sorted, so both panes color a given chemical identically) and extend the
	// palette to 11 distinct colors — then reuse the same map for tooltip
	// swatches, guaranteeing swatch = dot = line.
	// NB: pass this palette to the scale as `scheme`, NOT `range` — SveltePlot's
	// categorical color scale ignores `range` and silently falls back to
	// observable10 (which is exactly the 11th-chemical collision above).
	const PALETTE = [
		"#4269d0",
		"#efb118",
		"#ff725c",
		"#6cc5b0",
		"#3ca951",
		"#ff8ab7",
		"#a463f2",
		"#97bbf5",
		"#9c6b4e",
		"#9498a0",
		"#1b7f79"
	];
	const chemicals = [
		...new Set([...industry, ...consumer].map((d) => d.longName))
	].sort();
	const colorRange = chemicals.map((_, i) => PALETTE[i % PALETTE.length]);
	const colorOf = new Map(chemicals.map((n, i) => [n, colorRange[i]]));

	let rootW = $state(1024);
	let isMobile = $derived(rootW <= MOBILE_BREAKPOINT);
	let headerH = $derived(isMobile ? HEADER_H.mobile : HEADER_H.desktop);
	let footerH = $derived(footerState.visible ? FOOTER_H : 0);

	// Per-pane chart-area height (flexbox sizes it; the title is a sibling, so
	// this already excludes it). We don't track its width —
	// SveltePlot auto-sizes the SVG to the figure via its own clientWidth bind,
	// and passing a narrower `width` prop desyncs the viewBox and scales the
	// drawing down. Instead we reserve room for the legend with `marginRight`.
	let industryAreaH = $state(300);
	let consumerAreaH = $state(300);

	// Per-pane `.plot-header` footprint (= the legend, now that the title is our
	// own element). Desktop: legend sits in the reserved right margin, so its
	// width drives `marginRight`. Mobile: legend sits on top, so its height is
	// subtracted from the SVG height.
	let industryLegendW = $state(140);
	let industryLegendH = $state(48);
	let consumerLegendW = $state(140);
	let consumerLegendH = $state(48);

	// SVG height: full area on desktop (legend is absolutely positioned, out of
	// flow); area minus the on-top legend on mobile.
	function plotHeight(areaH: number, legendH: number) {
		return isMobile ? Math.max(areaH - legendH, 0) : areaH;
	}
	// Right margin reserved for the legend (desktop only).
	function plotMarginRight(legendW: number) {
		return isMobile ? 12 : legendW + LEGEND_GAP;
	}

	let industryHeight = $derived(plotHeight(industryAreaH, industryLegendH));
	let consumerHeight = $derived(plotHeight(consumerAreaH, consumerLegendH));
	let industryMarginRight = $derived(plotMarginRight(industryLegendW));
	let consumerMarginRight = $derived(plotMarginRight(consumerLegendW));

	// Attachment factory: find this pane's `.plot-header` and report its width +
	// full height (box + margin-top, which offsetHeight excludes). The
	// ResizeObserver refires when the legend reflows (e.g. wrapping on mobile).
	function measureLegend(set: (w: number, h: number) => void) {
		return (node: HTMLElement) => {
			const header = node.querySelector<HTMLElement>(".plot-header");
			if (!header) return;
			const measure = () => {
				const mt = parseFloat(getComputedStyle(header).marginTop) || 0;
				set(header.offsetWidth, header.offsetHeight + mt);
			};
			measure();
			const ro = new ResizeObserver(measure);
			ro.observe(header);
			return () => ro.disconnect();
		};
	}

	$inspect("footerH", footerH);
	$inspect("footerState.visible", footerState.visible);
	// console.log("footerH", footerH);
	// console.log("footerState.visible", footerState.visible);
</script>

<!-- The "function that turns a dataset into a chart": one line per chemical,
     x = year, y = num. Minimal — grid, axes, right/top color legend. The title
     is rendered by the pane (see below), not by Plot. -->
{#snippet chart(data: any[], height: number, marginRight: number)}
	<Plot
		{height}
		marginLeft={40}
		{marginRight}
		grid
		x={{ type: "time", label: "Year →" }}
		y={{
			domain: [0, Y_MAX],
			label: "↑ Number of reports",
			tickFormat: (d: number) => `${d}`
		}}
		color={{ legend: true, domain: chemicals, scheme: colorRange }}
	>
		<Line {data} x="date" y="num" z="name" stroke="longName" strokeWidth={2} />

		<!-- Hover marker. Pointer finds the single datum nearest the cursor — no
		     `z`, so it searches one shared tree across every line (matching the
		     tooltip below) — and renders SVG: a faint vertical rule at that year
		     plus a dot on the line, colored by the same `longName` color scale. -->
		<Pointer {data} x="date" y="num" maxDistance={25}>
			{#snippet children({ data: hit })}
				<RuleX data={hit} x="date" stroke="currentColor" strokeOpacity={0.25} />
				<Dot
					data={hit}
					x="date"
					y="num"
					fill="longName"
					stroke="var(--svelteplot-bg, white)"
					strokeWidth={1.5}
					r={4.5}
				/>
			{/snippet}
		</Pointer>

		<!-- The HTML tooltip box. SveltePlot requires it in the `overlay` snippet
		     (an HTML layer over the SVG), not as a plain mark child. It runs its
		     own nearest-point search (also ignoring `z`), so it stays in sync
		     with the Pointer marker above. `datum` is `false` when nothing is
		     hovered, so guard before reading its fields. -->
		{#snippet overlay()}
			<!-- `y` is `num || 1e-9`, not plain "num", solely for the tooltip box's
			     placement. SveltePlot positions HTMLTooltip with a truthiness guard
			     (`tooltipY ? projectY(...) : 0`), so a literal y of 0 — our HBCD
			     chemicals, which ride the chart's baseline — collapses `top` to 0:
			     the box jumps to the top edge and is then clipped away by the
			     chart-area's `overflow: hidden`, which is why those tooltips looked
			     "broken." The epsilon is sub-pixel once projected (so the box still
			     anchors to the baseline dot), and `datum` is the full row, so the
			     displayed `num`/`perc` are the real 0s. (Pointer above is unaffected:
			     it guards with `y != null`.) -->
			<HTMLTooltip {data} x="date" y={(d: any) => d.num || 1e-9}>
				{#snippet children({ datum })}
					{#if datum}
						<div class="cbi-tooltip">
							<div class="tt-name">
								<span
									class="tt-swatch"
									style:background={colorOf.get(datum.longName)}
								></span>
								{datum.longName}
							</div>
							<div class="tt-row">
								<span>{datum.year}</span>
								<span class="tt-num">
									{datum.num} reports ({datum.perc.toFixed(1)}%)
								</span>
							</div>
						</div>
					{/if}
				{/snippet}
			</HTMLTooltip>
		{/snippet}
	</Plot>
{/snippet}

<div
	class="charts"
	class:mobile={isMobile}
	bind:clientWidth={rootW}
	style:--header-h={`${headerH}px - ${footerH}px`}
>
	<div class="pane">
		<div class="chart-title">Industry</div>
		<div
			class="chart-area"
			bind:clientHeight={industryAreaH}
			{@attach measureLegend(
				(w, h) => ((industryLegendW = w), (industryLegendH = h))
			)}
		>
			{@render chart(industry, industryHeight, industryMarginRight)}
		</div>
	</div>

	<div class="pane">
		<div class="chart-title">Consumer & Commercial</div>
		<div
			class="chart-area"
			bind:clientHeight={consumerAreaH}
			{@attach measureLegend(
				(w, h) => ((consumerLegendW = w), (consumerLegendH = h))
			)}
		>
			{@render chart(consumer, consumerHeight, consumerMarginRight)}
		</div>
	</div>
</div>

<style>
	.charts {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0rem 0.5rem;
		box-sizing: border-box;
		font-family: Helvetica, Arial, sans-serif;
	}

	/* Desktop: both charts share one screen, minus the sticky header. */
	.charts:not(.mobile) {
		height: calc(95dvh - var(--header-h));
	}

	.charts:not(.mobile) .pane {
		flex: 1 1 0;
		min-height: 300px;
		max-height: 700px;
	}

	/* Mobile: one chart per screen — 11 swatches + two charts is too cramped
	   stacked, so each pane gets its own viewport (minus the sticky header) and
	   the page scrolls. Full-bleed horizontally to maximize the cramped width. */
	.charts.mobile .pane {
		height: calc(100dvh - var(--header-h));
		padding-inline: 0rem;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		/* A little vertical slack (with border-box so it shrinks the chart, not
		   the pane) so the chart needn't be pixel-perfectly centered when
		   scrolling — matters most on mobile where each pane is a full screen.
		   padding-inline does the same horizontally; the SVG auto-sizes to the
		   narrower figure width, so no viewBox scaling. */
		box-sizing: border-box;
		/*padding-block: 0.7rem;*/
		padding-inline: 5rem;
	}

	/* chart-area is the only flexible child, so its measured height already
	   excludes the title — the SVG sizes straight to it. */
	.chart-area {
		flex: 1 1 0;
		min-height: 0;
		overflow: hidden;
	}

	/* Matches SveltePlot's default <h3> subtitle look (the style story.svelte
	   now mirrors); kept as our own element so the legend can sit beside the
	   chart. Centered above the chart. */
	.chart-title {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.2;
		/*text-align: center;*/
	}

	/* Desktop: the SVG keeps the figure's full width (so its viewBox matches and
	   it isn't scaled down); the legend-only `.plot-header` is lifted out of flow
	   and parked in the right margin we reserved via the `marginRight` prop. */
	.charts:not(.mobile) :global(figure.svelteplot) {
		position: relative;
	}

	.charts:not(.mobile) :global(figure.svelteplot .plot-header) {
		position: absolute;
		top: 50%;
		right: 0;
		transform: translateY(-50%);
		margin-top: 0;
	}

	/* Stack the swatches vertically for the right-side layout. */
	.charts:not(.mobile) :global(figure.svelteplot .color-legend) {
		display: flex;
		flex-direction: column;
	}

	/* Tooltip box. HTMLTooltip anchors its wrapper's top-left at the hovered
	   point; this transform floats our box centered just above it. */
	.cbi-tooltip {
		transform: translate(-50%, calc(-100% - 12px));
		background: #fff;
		border: 1px solid rgba(0, 0, 0, 0.15);
		border-radius: 4px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
		padding: 6px 9px;
		font-size: 12px;
		line-height: 1.3;
		white-space: nowrap;
	}

	.tt-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		margin-bottom: 2px;
	}

	/* Color chip matching this chemical's line/dot (same scale, see `colorOf`). */
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
