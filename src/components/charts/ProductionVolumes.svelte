<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import { Line, Plot } from "svelteplot";
	import { autoType } from "d3";
	import volumesRaw from "$data/methylene-chloride-production-volumes.csv";

	// One row of methylene-chloride-production-volumes.csv (post-autoType).
	// `category` distinguishes the four series: consumer, industrial, and the
	// low/high production-volume bounds. NB the source data has a trailing space
	// on "low " — kept here so the type matches the raw values until it's trimmed.
	type VolumeRow = {
		year: number;
		volume: number;
		category: "con" | "ind" | "low " | "high";
		chemical: string;
		date: Date;
	};

	const MOBILE_BREAKPOINT = 768;
	// Sticky site header height (mirrors story.svelte's HEADER_H). Subtracted
	// from the 100dvh panes below so a "full screen" chart fits *under* the
	// header instead of overflowing it.
	const HEADER_H = { mobile: 48, desktop: 65 };
	const FOOTER_H = 54.6;

	// dsv returns string-valued rows; d3's autoType coerces each field to its
	// natural type (numbers for year/volume, strings for category/chemical).
	// We also add a `date` (Jan 1 of `year`) for the time axis.
	// autoType mutates its argument, so clone each row first — volumesRaw is a
	// shared module-cached import and the component <script> re-runs per render
	// (calling autoType on already-coerced numbers throws ".trim is not a function").
	const volumes: VolumeRow[] = volumesRaw.map((d: Record<string, string>) => {
		const row = autoType({ ...d }) as VolumeRow;
		row.date = new Date(row.year, 0, 1);
		return row;
	});

	let rootW = $state(1024);
	let isMobile = $derived(rootW <= MOBILE_BREAKPOINT);
	let headerH = $derived(isMobile ? HEADER_H.mobile : HEADER_H.desktop);
	let footerH = $derived(footerState.visible ? FOOTER_H : 0);

	let areaH = $state(300);
</script>

<div
	class="chart"
	class:mobile={isMobile}
	bind:clientWidth={rootW}
	style:--header-h={`${headerH}px - ${footerH}px`}
>
	<div class="pane">
		<div class="chart-title">Production Volumes</div>
		<div class="chart-area" bind:clientHeight={areaH}>
			<Plot height={areaH} marginLeft={60} grid x={{ label: "Year →" }}>
				<Line
					data={volumes}
					x="date"
					y="volume"
					z="category"
					stroke="category"
					strokeWidth={2}
				/>
			</Plot>
		</div>
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

	.chart:not(.mobile) .pane {
		flex: 1 1 0;
		min-height: 300px;
		max-height: 700px;
	}

	.chart.mobile .pane {
		height: calc(100dvh - var(--header-h));
		padding-inline: 0rem;
	}

	.pane {
		display: flex;
		flex-direction: column;
		min-height: 0;
		box-sizing: border-box;
		padding-inline: 5rem;
	}

	.chart-area {
		flex: 1 1 0;
		min-height: 0;
		overflow: hidden;
	}

	.chart-title {
		margin: 0;
		font-size: 15px;
		font-weight: 700;
		line-height: 1.2;
	}
</style>
