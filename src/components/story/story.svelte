<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import RefreshCopy from "$components/helpers/RefreshCopy.svelte";
	import ScrolloSteps from "$components/helpers/ScrolloSteps.svelte";
	import { Plot, Line } from "svelteplot";
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
		consumerAll: "#1b9e77",
		industryAll: "#d95f02",
		consumerTop: "#7570b3",
		industryTop: "#e7298d"
	};

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

	// Which series are visible at a given step. Single source of truth for both
	// the data filter and the entrance animation below.
	function namesForStep(s: number | null) {
		if (s == null || s < 1) return ["consumerAll"];
		if (s < 2) return ["consumerAll", "industryAll"];
		return allNames;
	}

	const visibleNames = $derived(namesForStep(step)); // your per-step subset

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

	const enteringNames = $derived.by(() => {
		const current = namesForStep(step);
		const previous = step == null ? [] : namesForStep(step - 1);
		return current.filter((n) => !previous.includes(n));
	});

	const reveal = new Tween(1, { duration: DRAW_DURATION, easing: cubicInOut });

	// Replay the draw whenever a new set of lines enters. Pure side-effect:
	// reads `enteringNames`, drives the tween, assigns no state. Runs before
	// paint (`pre`) so entering lines start hidden — no flash of the full line.
	$effect.pre(() => {
		if (!enteringNames.length) return;
		untrack(() => {
			reveal.set(0, { duration: 0 }); // synchronous reset → hidden
			reveal.set(1, {
				duration: prefersReducedMotion.current ? 0 : DRAW_DURATION
			});
		});
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
				bind:clientWidth={chartWidth}
				bind:clientHeight={chartHeight}
				style:--reveal={reveal.current}
				{@attach measurePlotHeader}
			>
				{#if data?.length}
					<Plot
						marginRight={12}
						subtitle="Percentage of reports that claim CBI for production volume"
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
							domain: visibleNames.map((n) => LONG[n]),
							range: visibleNames.map((n) => COLORS[n])
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
								enteringNames.includes(d.name) ? "draw-in" : ""}
						/>
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
		width: 92%;
		height: 100%;
		margin: 0 auto;
	}

	/* Lines tagged `draw-in` reveal from left to right as `--reveal` tweens
	   0 → 1. The dash length just needs to exceed any path length. */
	.chart-container :global(.draw-in path) {
		stroke-dasharray: 4000;
		stroke-dashoffset: calc(4000 * (1 - var(--reveal, 1)));
	}
</style>
