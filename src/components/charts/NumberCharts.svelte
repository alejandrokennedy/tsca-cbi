<script lang="ts">
	import { Plot, Line } from "svelteplot";
	import consumerRaw from "$data/consumerData.csv";
	import industryRaw from "$data/industryData.csv";

	const MOBILE_BREAKPOINT = 768;
	const Y_MAX = 70;
	const LEGEND_GAP = 16; // px between chart and right-side legend (desktop)
	const HBCD_NOTE =
		"*HBCD is a cluster of three chemicals, each with its own unique CAS number.";

	// The dsv plugin returns string-valued rows (coercion now lives here, not in
	// vite.config.js); cast `num` and add a `date` for the time axis.
	function toSeries(rows: any[]) {
		return rows
			.map((d) => ({
				name: d.name,
				longName: d.longName.trim(),
				year: +d.year,
				num: +d.num,
				date: new Date(+d.year, 0, 1)
			}))
			.sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year);
	}

	const consumer = toSeries(consumerRaw);
	const industry = toSeries(industryRaw);

	let rootW = $state(1024);
	let isMobile = $derived(rootW <= MOBILE_BREAKPOINT);

	// Per-pane chart-area height (flexbox sizes it; the title/footnote are
	// siblings, so this already excludes them). We don't track its width —
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
</script>

<!-- The "function that turns a dataset into a chart": one line per chemical,
     x = year, y = num. Minimal — grid, axes, right/top color legend. The title
     and footnote are rendered by the pane (see below), not by Plot. -->
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
		color={{ legend: true }}
	>
		<Line {data} x="date" y="num" z="name" stroke="longName" strokeWidth={2} />
	</Plot>
{/snippet}

<div class="charts" class:mobile={isMobile} bind:clientWidth={rootW}>
	<div class="pane">
		<div class="chart-title">
			Industry — number of CBI claims for TSCA top 10 chemicals
		</div>
		<div
			class="chart-area"
			bind:clientHeight={industryAreaH}
			{@attach measureLegend(
				(w, h) => ((industryLegendW = w), (industryLegendH = h))
			)}
		>
			{@render chart(industry, industryHeight, industryMarginRight)}
		</div>
		<p class="chart-footnote">{HBCD_NOTE}</p>
	</div>

	<div class="pane">
		<div class="chart-title">
			Consumer & commercial — number of CBI claims for TSCA top 10 chemicals
		</div>
		<div
			class="chart-area"
			bind:clientHeight={consumerAreaH}
			{@attach measureLegend(
				(w, h) => ((consumerLegendW = w), (consumerLegendH = h))
			)}
		>
			{@render chart(consumer, consumerHeight, consumerMarginRight)}
		</div>
		<p class="chart-footnote">{HBCD_NOTE}</p>
	</div>
</div>

<style>
	.charts {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		box-sizing: border-box;
		font-family: Helvetica, Arial, sans-serif;
	}

	/* Desktop: both charts share one screen. */
	.charts:not(.mobile) {
		height: 100dvh;
	}

	.charts:not(.mobile) .pane {
		flex: 1 1 0;
		min-height: 0;
	}

	/* Mobile: one chart per screen — 11 swatches + two charts is too cramped
	   stacked, so each pane gets its own viewport and the page scrolls. */
	.charts.mobile .pane {
		height: 100dvh;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	/* chart-area is the only flexible child, so its measured height already
	   excludes the title + footnote — the SVG sizes straight to it. */
	.chart-area {
		flex: 1 1 0;
		min-height: 0;
		overflow: hidden;
	}

	/* Matches SveltePlot's default <h3> subtitle look (the style story.svelte
	   now mirrors); kept as our own element so the legend can sit beside the
	   chart while the title stays top-left. */
	.chart-title {
		margin: 0;
		font-size: 1.17em;
		font-weight: 700;
		line-height: 1.2;
	}

	.chart-footnote {
		margin: 0 0 0.25rem;
		font-size: 11px;
		font-style: italic;
		opacity: 0.7;
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
</style>
