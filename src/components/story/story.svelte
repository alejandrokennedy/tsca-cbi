<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import RefreshCopy from "$components/helpers/RefreshCopy.svelte";
	import ScrolloSteps from "$components/helpers/ScrolloSteps.svelte";
	import { Plot, Line, Pointer, Dot, RuleX, HTMLTooltip } from "svelteplot";
	import rawData from "$data/data.csv";
	import { Tween, prefersReducedMotion } from "svelte/motion";
	import { cubicInOut } from "svelte/easing";
	import { untrack } from "svelte";

	interface Props {
		copy?: any;
		darkMode?: boolean;
	}

	// let { copy, darkMode = false }: Props = $props();
	let { copy: initialCopy, darkMode = false }: Props = $props();
	let copy = $state(initialCopy);
	const DOC_ID = "1mbL3p0m0cB_DvTG8dcJBj_5LViudc4LyZyAaRdY3Og0";

	const HEADER_H = { mobile: 48, desktop: 65 };
	const FOOTER_H = 54.6;
	const MOBILE_BREAKPOINT = 768;
	const COLORS = {
		// ── ACTIVE ── Teal / Amber (light on Top — swapped)
		// consumerAll: "#15605a",
		// industryAll: "#c75000",
		// consumerTop: "#4fb0a5",
		// industryTop: "#f4b860"

		// To test a scheme below, comment out the 4 active lines above and
		// uncomment one block. Key order must stay consumerAll, industryAll,
		// consumerTop, industryTop.

		// ───── Light-on-Top variants (light tone = "Top" series; swap the
		//   consumerAll/consumerTop and industryAll/industryTop pairs to flip) ─────

		// ── Blue / Orange (ColorBrewer, colorblind-safe) ──
		// consumerAll: "#08519c",
		// industryAll: "#a63603",
		// consumerTop: "#6baed6",
		// industryTop: "#fd8d3c"

		// ── Teal / Amber ──  (same as active)
		// consumerAll: "#15605a",
		// industryAll: "#c75000",
		// consumerTop: "#4fb0a5",
		// industryTop: "#f4b860"

		// ── Purple / Green ──
		// consumerAll: "#54278f",
		// industryAll: "#006d2c",
		// consumerTop: "#9e9ac8",
		// industryTop: "#74c476"

		// ───── Comparable-brightness pairs (no light/dark split within a pair;
		//   consumer = cool duo, industry = warm duo, so the pairing is gentler
		//   but all four sit at similar brightness) ─────

		// ── Temperature duo, saturated — blue + teal / coral + raspberry ──
		consumerAll: "#3e92cc",
		industryAll: "#ff785a",
		consumerTop: "#2ec4b6",
		industryTop: "#e84a75"

		// ── Temperature duo, muted — dusty blue + sage / terracotta + dusty rose ──
		// consumerAll: "#5a8fbb",
		// industryAll: "#d98c5f",
		// consumerTop: "#6ba89a",
		// industryTop: "#cc6a8a"

		// ───── Original light/dark schemes (light tone = "All" series) ─────

		// ── Blue / Red (original first active) ──
		// consumerAll: "#4B8CE7",
		// industryAll: "#EB5C68",
		// consumerTop: "#364981",
		// industryTop: "#B31947"

		// ── Tableau (original) — blue / orange / green / red (not hue-paired) ──
		// consumerAll: "#4e79a7",
		// industryAll: "#f28e2b",
		// consumerTop: "#59a14f",
		// industryTop: "#e15759"

		// ── Teal / Rose ──
		// consumerAll: "#4fb0a5",
		// industryAll: "#e8779e",
		// consumerTop: "#15605a",
		// industryTop: "#9b1b5a"

		// ── Steel-blue / Sienna (muted, editorial) ──
		// consumerAll: "#7ba0c4",
		// industryAll: "#e59866",
		// consumerTop: "#2e4c6d",
		// industryTop: "#a04000"
	};
	// [
	// 	"#a6cee3",
	// 	"#1f78b4",
	// 	"#b2df8a",
	// 	"#33a02c",
	// 	"#fb9a99",
	// 	"#e31a1c",
	// 	"#fdbf6f",
	// 	"#ff7f00",
	// 	"#cab2d6",
	// 	"#6a3d9a",
	// 	"#ffff99",
	// 	"#b15928"
	// ];

	let width = $state(1024);
	let height = $state(800);
	let chartWidth = $state(400);
	let chartHeight = $state(400);
	// SveltePlot renders the subtitle + color legend in a `.plot-header` block
	// *above* the SVG, and the `height` prop only sizes the SVG. So the header
	// eats into the available height — and it isn't constant (the legend wraps
	// on narrow screens and grows as more series appear at later steps). We
	// measure it live (see `measurePlotHeader` below) instead of hardcoding it.
	let plotHeaderH = $state(75);
	let isMobile = $derived(width <= MOBILE_BREAKPOINT);
	let headerH = $derived(isMobile ? HEADER_H.mobile : HEADER_H.desktop);
	let footerH = $derived(footerState.visible ? FOOTER_H : 0);
	let chapters = $derived(copy.story);
	let step = $state(null);
	const sortedData = rawData
		.map((d) => ({
			...d,
			year: +d.year,
			value: +d.value,
			date: new Date(+d.year, 0, 1)
		}))
		.sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year);

	const allNames = Object.keys(COLORS);
	const LONG = Object.fromEntries(
		sortedData.map((d) => [d.name, d.longName.trim()])
	);

	$inspect("footerH", footerH);
	$inspect("footerState.visible", footerState.visible);
	console.log("footerH", footerH);
	console.log("footerState.visible", footerState.visible);

	// Which series are visible at a given step. Single source of truth for both
	// the data filter and the entrance animation below.
	function namesForStep(s: number | null) {
		if (s == null || s < 1) return ["consumerAll"];
		if (s < 2) return ["consumerAll", "industryAll"];
		return allNames;
	}

	const visibleNames = $derived(namesForStep(step)); // your per-step subset

	// Has the first step fired yet? Single trigger for both the line draw-in
	// and the legend swatch fade-in below. `null` = the reader hasn't reached
	// any step, so the chart frame shows but the line + swatch stay hidden.
	const started = $derived(step != null);

	const data = $derived(
		sortedData.filter((d) => namesForStep(step).includes(d.name))
	);

	const yExtentData = $derived([0, step == null || step < 2 ? 60 : 80]);

	const yDomain = Tween.of(() => yExtentData, {
		duration: 1000,
		easing: cubicInOut
	});

	// --- Line entrance animation -------------------------------------------
	// Each line (one per `name`) draws itself from left to right the first time
	// it appears. The series that are new at the current step (i.e. not present
	// at the previous step) get tagged `draw-in`; `reveal` then tweens their
	// stroke-dashoffset via the `--reveal` custom prop so they sweep in.
	const DRAW_DURATION = 2200;

	// The step we last drew. Plain (non-reactive) on purpose: it's read by
	// `enteringNames` but must NOT invalidate it (only `step` should), and it's
	// committed in a post-effect below — after this tick's draw has consumed it.
	// `undefined` = nothing rendered yet, so the first series still draws in.
	let prevStep: number | null | undefined;

	const enteringNames = $derived.by(() => {
		// Before the first step nothing has entered yet.
		if (!started) return [];
		const current = namesForStep(step);
		// Compare against where the user actually came from, not `step - 1`.
		// Scrolling up to a lower step only *removes* series, so this set is
		// empty and nothing redraws the wrong way on the way back up. Treating
		// a `null` prev (pre-start) as "nothing shown" is what lets the very
		// first series draw in on the null → step 0 transition.
		const previous = prevStep == null ? [] : namesForStep(prevStep);
		return current.filter((n) => !previous.includes(n));
	});

	// Start hidden (0): combined with the `draw-in` class, a fully-wiped line.
	const reveal = new Tween(0, { duration: DRAW_DURATION, easing: cubicInOut });

	// Replay the draw whenever a new set of lines enters. Pure side-effect:
	// reads `enteringNames`, drives the tween, assigns no state. Runs before
	// paint (`pre`) so entering lines start hidden — no flash of the full line.
	$effect.pre(() => {
		// Before the first step: hold every line wiped out (reveal 0) and don't
		// animate. They all carry `draw-in` until `started`, so this hides them.
		if (!started) {
			untrack(() => reveal.set(0, { duration: 0 }));
			return;
		}
		if (!enteringNames.length) return;
		untrack(() => {
			reveal.set(0, { duration: 0 }); // synchronous reset → hidden
			reveal.set(1, {
				duration: prefersReducedMotion.current ? 0 : DRAW_DURATION
			});
		});
	});

	// Commit the current step as "previous" once this tick's draw has run.
	// Post-effect (not `pre`) so it fires after `enteringNames` and the render
	// have already read the old value; `prevStep` is plain, so this assignment
	// doesn't retrigger the derived.
	$effect(() => {
		prevStep = step;
	});

	// Attachment for the chart-container: find SveltePlot's `.plot-header` and
	// reserve its full footprint (its box + its `margin-top`, which
	// offsetHeight excludes) so the SVG height tracks whatever space is left.
	// The ResizeObserver refires when the legend wraps or the series count
	// changes; reading `data?.length` re-runs the attachment if the Plot
	// (re)mounts and the `.plot-header` node is recreated.
	function measurePlotHeader(node: HTMLElement) {
		data?.length;
		const header = node.querySelector<HTMLElement>(".plot-header");
		if (!header) return;
		const measure = () => {
			const mt = parseFloat(getComputedStyle(header).marginTop) || 0;
			plotHeaderH = header.offsetHeight + mt;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(header);
		return () => ro.disconnect();
	}
</script>

<div class="scrollo-story" class:scrollo-dark={darkMode}>
	<div
		id="background"
		bind:clientHeight={height}
		bind:clientWidth={width}
		style:height={`calc(100vh - ${headerH}px - ${footerH}px)`}
		style:top={`${headerH}px`}
	>
		<div class="layout-container">
			<!-- Visualization goes here -->
			<div
				class="chart-container"
				class:started
				bind:clientWidth={chartWidth}
				bind:clientHeight={chartHeight}
				style:--reveal={reveal.current}
				{@attach measurePlotHeader}
			>
				{#if data?.length}
					<Plot
						marginRight={12}
						marginLeft={32}
						subtitle="Percentage of TSCA CDR reports that claim CBI for production volume"
						height={chartHeight - plotHeaderH}
						width={chartWidth}
						grid
						x={{
							type: "time",
							label: "Year →"
						}}
						y={{
							domain: yDomain.current,
							tickSpacing: 60,
							label: "↑ Percentage",
							tickFormat: (d) => `${d}%`
						}}
						color={{
							legend: true,
							// SveltePlot ignores `range` for categorical color scales —
							// it only reads `scheme` (autoScales.js → autoScaleColor). A
							// plain `{ label: color }` object IS a valid scheme: its keys
							// become the domain, its values the range, so this sets the
							// palette. (Passing `range` here silently fell back to the
							// default observable10 scheme.)
							scheme: Object.fromEntries(
								visibleNames.map((n) => [LONG[n], COLORS[n]])
							),
							// Explicit domain in `COLORS` order. Without it, the scale
							// derives its domain from the data and sorts it alphabetically
							// (sortOrdinalDomains defaults true), which reshuffles the
							// legend once all four series are present. An explicit ordinal
							// domain is used verbatim, so series enter in COLORS order.
							domain: visibleNames.map((n) => LONG[n])
						}}
					>
						<Line
							{data}
							x="date"
							y="value"
							z="name"
							stroke={(d) => LONG[d.name]}
							strokeWidth={3}
							strokeOpacity={0.9}
							lineClass={(d) =>
								!started || enteringNames.includes(d.name) ? "draw-in" : ""}
						/>

						<!-- Hover marker. Pointer finds the single datum nearest the
						     cursor (no `z`, so one shared search tree across every
						     visible line) and draws a faint year rule plus a dot on the
						     line, colored via the same `LONG[name]` → color scale as the
						     lines. `{data}` is the per-step subset, so only series visible
						     at the current step are hoverable. -->
						<Pointer {data} x="date" y="value" maxDistance={25}>
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
									y="value"
									fill={(d) => LONG[d.name]}
									stroke="var(--svelteplot-bg, white)"
									strokeWidth={1.5}
									r={4.5}
								/>
							{/snippet}
						</Pointer>

						<!-- HTML tooltip box. SveltePlot requires it in the `overlay`
						     snippet (an HTML layer over the SVG). It runs its own
						     nearest-point search (also ignoring `z`), so it stays in sync
						     with the Pointer marker. `datum` is `false` when nothing is
						     hovered. Swatch + label are keyed off `name` via COLORS / LONG
						     (the real color source of truth — the Plot `scheme`), so they
						     match the line and dodge the CSV's untrimmed longName. -->
						{#snippet overlay()}
							<HTMLTooltip {data} x="date" y="value">
								{#snippet children({ datum })}
									{#if datum}
										<div class="cbi-tooltip">
											<div class="tt-name">
												<span
													class="tt-swatch"
													style:background={COLORS[datum.name]}
												></span>
												{LONG[datum.name]}
											</div>
											<div class="tt-value">{datum.value.toFixed(1)}%</div>
										</div>
									{/if}
								{/snippet}
							</HTMLTooltip>
						{/snippet}
					</Plot>
				{/if}
			</div>
		</div>
	</div>
	<!-- uncomment below to pull directly from gdoc on page reload -->
	<RefreshCopy docId={DOC_ID} bind:data={copy} />

	<ScrolloSteps
		bind:step
		{chapters}
		--scrollo-foreground-margin-inline="auto"
	/>
</div>

<style>
	.scrollo-story {
		color-scheme: light;
	}

	.scrollo-story.scrollo-dark {
		color-scheme: dark;
	}

	:global(body):has(.scrollo-dark) {
		background-color: black;
	}

	#background {
		position: sticky;
	}

	.layout-container {
		position: relative;
		height: 100%;
		width: 100%;
		overflow: hidden;

		/* Fallback for pre-2024 browsers (Flexbox) */
		display: flex;
		flex-direction: column;
		justify-content: center;

		/* Modern 2026 standard (Block layout centering) */
		display: block;
		align-content: center;
	}

	.chart-container {
		width: 82%;
		height: 96%;
		margin: 0 auto;
		font-family: Helvetica, Arial, sans-serif;
	}

	/* Match the subtitle to the static charts' title look. Global scoped.css
	   styles `:where(.scrollo-story) h3` at 28px in the serif --font-body; this
	   overrides it back to the clean sans-serif default (NumberCharts.svelte). */
	.chart-container :global(.plot-header h3) {
		font-family: Helvetica, Arial, sans-serif;
		font-size: 1.17em;
		font-weight: 700;
	}

	/* Lines tagged `draw-in` reveal from left to right as `--reveal` tweens
	   0 → 1. The dash length just needs to exceed any path length. */
	.chart-container :global(.draw-in path) {
		stroke-dasharray: 4000;
		stroke-dashoffset: calc(4000 * (1 - var(--reveal, 1)));
	}

	/* Tooltip box (mirrors NumberCharts.svelte). HTMLTooltip anchors its
	   wrapper's top-left at the hovered point; this transform floats our box
	   centered just above it. */
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
		color: #000;
	}

	.tt-name {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		margin-bottom: 2px;
	}

	/* Color chip matching this series' line/dot (same COLORS map). */
	.tt-swatch {
		flex: none;
		width: 10px;
		height: 10px;
		border-radius: 2px;
	}

	.tt-value {
		opacity: 0.85;
		font-variant-numeric: tabular-nums;
	}

	/* Color legend. Two layers:
	   1. Container gate: the whole legend is hidden until the first step. The
	      `consumerAll` item is in the DOM from page load, so without this it
	      would fade in at load instead of when the reader reaches step 0.
	   2. Per-item entrance: each item (swatch + label) fades in when it mounts.
	      SveltePlot's legend each-block is keyed by series name, so introducing
	      a series adds *only* its node — already-visible items keep their nodes
	      and never replay. Duration matches the gate so the first reveal and
	      later introductions look identical. */
	.chart-container :global(.color-legend) {
		opacity: 0;
		transition: opacity 600ms ease;
	}

	.chart-container.started :global(.color-legend) {
		opacity: 1;
	}

	.chart-container :global(.color-legend .item) {
		animation: legend-item-in 600ms ease both;
	}

	@keyframes -global-legend-item-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@media (max-width: 768px) {
		.chart-container {
			width: 96%;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chart-container :global(.color-legend),
		.chart-container :global(.color-legend .item) {
			transition: none;
			animation: none;
		}
	}
</style>
