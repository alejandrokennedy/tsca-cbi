<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import RefreshCopy from "$components/helpers/RefreshCopy.svelte";
	import ScrolloSteps from "$components/helpers/ScrolloSteps.svelte";
	import { Plot, Line } from "svelteplot";
	import { max, extent } from "d3-array";
	import rawData from "$data/data.csv";
	import { Tween } from "svelte/motion";
	import { cubicInOut } from "svelte/easing";

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

	let width = $state(1024);
	let height = $state(800);
	let chartWidth = $state(1024);
	let chartHeight = $state(800);
	let isMobile = $derived(width <= MOBILE_BREAKPOINT);
	let headerH = $derived(isMobile ? HEADER_H.mobile : HEADER_H.desktop);
	let footerH = $derived(footerState.visible ? FOOTER_H : 0);
	let chapters = $derived(copy.story);
	let step = $state(null);
	const sortedData = rawData
		.map((d) => ({ ...d, year: +d.year, value: +d.value }))
		.sort((a, b) => a.name.localeCompare(b.name) || a.year - b.year);

	const data = $derived(
		sortedData.filter((d) =>
			step == null || step < 1
				? d.name === "consumerAll"
				: step < 2
					? d.name === "consumerAll" || d.name === "industryAll"
					: d
		)
	);

	const yMax = $derived(
		step == null || step < 2
			? max(data.map((d) => d.value))
			: max(sortedData.map((d) => d.value))
	);

	const yExtentData = $derived(extent([0, yMax + 5]));

	const yDomain = Tween.of(() => yExtentData, {
		duration: 1000,
		easing: cubicInOut
	});
	$inspect("data", data);
	$inspect("yExtentData", yExtentData);
	$inspect("yDomain", yDomain);
	$inspect("yMax", yMax);
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
			>
				<Plot
					marginRight={12}
					height={chartHeight}
					width={chartWidth}
					grid
					y={{
						domain: yDomain.current,
						// tickSpacing: 120,
						label: "↑ Percentage"
					}}
				>
					<Line {data} x="year" y="value" z="name" stroke="name" />
				</Plot>
			</div>
		</div>
	</div>
	<!-- uncomment below to pull directly from gdoc on page reload -->
	<RefreshCopy docId={DOC_ID} bind:data={copy} />

	<ScrolloSteps bind:step {chapters} />
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
		height: 95%;
		margin: 0 auto;
	}
</style>
