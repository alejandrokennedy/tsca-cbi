<script lang="ts">
	import { getContext } from "svelte";
	import StoryContainer from "./story/StoryContainer.svelte";
	import Story from "./story/Story.svelte";
	import NumberCharts from "$components/charts/NumberCharts.svelte";
	import DummyFooter from "$components/DummyFooter.svelte";

	const copy = getContext("copy");
	const data = getContext("data");
</script>

<svelte:boundary onerror={(e) => console.error(e)}>
	<StoryContainer>
		<Story {copy} />
		<NumberCharts />
		<!-- <Story {copy} darkMode /> -->
	</StoryContainer>
	<!-- <DummyFooter /> -->
</svelte:boundary>
