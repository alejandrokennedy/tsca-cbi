<script lang="ts">
	import { footerState } from "$utils/footerState.svelte";
	import { Line, BarY, Plot, AreaY } from "svelteplot";
	import { autoType } from "d3";
	import volumesRaw from "$data/methylene-chloride-production-volumes.csv";

	// One row of methylene-chloride-production-volumes.csv (post-autoType).
	// `category` distinguishes the four series: consumer, industrial, and the
	// low/high production-volume bounds. (The source has a trailing space on
	// "low "; we .trim() it at parse time, so the type uses the clean values.)
	type VolumeRow = {
		year: number;
		volume: number;
		category: "con" | "ind" | "low" | "high";
		chemical: string;
		date: Date;
	};

	// Wide "band" row: one per year carrying both production-volume bounds, so
	// AreaY can draw a single low→high band (its y1/y2 channels each need one
	// value per x — they can't pull two rows out of the long-format data).
	type BandRow = { year: number; date: Date; low: number; high: number };

	const MOBILE_BREAKPOINT = 768;
	// Sticky site header height (mirrors story.svelte's HEADER_H). Subtracted
	// from the 100dvh panes below so a "full screen" chart fits *under* the
	// header instead of overflowing it.
	const HEADER_H = { mobile: 48, desktop: 65 };
	const FOOTER_H = 54.6;
	// Vertical room reserved for the color legend, which SveltePlot renders in a
	// `.plot-header` *above* the SVG. We shrink the SVG by this much so the figure
	// (legend + SVG) still fits inside `.chart-area` instead of having its bottom
	// (the x-axis) clipped by `overflow: hidden`. Bump if the legend wraps.
	const LEGEND_H = 44;

	// dsv returns string-valued rows; d3's autoType coerces each field to its
	// natural type (numbers for year/volume, strings for category/chemical).
	// We also add a `date` (Jan 1 of `year`) for the time axis.
	// autoType mutates its argument, so clone each row first — volumesRaw is a
	// shared module-cached import and the component <script> re-runs per render
	// (calling autoType on already-coerced numbers throws ".trim is not a function").
	// Sort by category, then year: SveltePlot's Line groups into separate series
	// with a *sequential* scan (it starts a new line only when the z/category
	// value differs from the previous row). The raw CSV interleaves categories
	// per year, so without this every line would be a single point (nothing to
	// draw). Sorting makes each category contiguous and year-ascending.
	const volumes: VolumeRow[] = volumesRaw
		.map((d: Record<string, string>) => {
			const row = autoType({ ...d }) as VolumeRow;
			row.category = row.category.trim() as VolumeRow["category"];
			row.date = new Date(row.year, 0, 1);
			return row;
		})
		.sort((a, b) => a.category.localeCompare(b.category) || a.year - b.year);

	// Pivot long → wide for the AreaY band: collapse each year's `low`/`high`
	// rows into one record with both bounds as fields.
	const years = [...new Set(volumes.map((d) => d.year))].sort((a, b) => a - b);
	const band: BandRow[] = years.map((year) => ({
		year,
		date: new Date(year, 0, 1),
		low: volumes.find((d) => d.year === year && d.category === "low")!.volume,
		high: volumes.find((d) => d.year === year && d.category === "high")!.volume
	}));

	let rootW = $state(1024);
	let isMobile = $derived(rootW <= MOBILE_BREAKPOINT);
	let headerH = $derived(isMobile ? HEADER_H.mobile : HEADER_H.desktop);
	let footerH = $derived(footerState.visible ? FOOTER_H : 0);

	let areaH = $state(300);
	let barAreaH = $state(300);

	// Single series for the bar chart (one bar per year), to keep it legible.
	const industrial = volumes.filter((d) => d.category === "ind");
	// $inspect("volumes", volumes);
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
			<Plot
				height={areaH - LEGEND_H}
				color={{ legend: true }}
				marginLeft={60}
				grid
				x={{ label: "Year →" }}
			>
				<!-- y={{ type: "log" }} -->
				<AreaY
					data={band}
					x="date"
					y1="low"
					y2="high"
					fill="#9498a0"
					fillOpacity={0.2}
				/>
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

	<!-- <div class="pane">
		<div class="chart-title">Industrial volume by year</div>
		<div class="chart-area" bind:clientHeight={barAreaH}>
			<Plot height={barAreaH} marginLeft={60} grid x={{ label: "Year →" }}>
				<BarY data={industrial} x="year" y="volume" fill="#4269d0" />
			</Plot>
		</div>
	</div> -->
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
