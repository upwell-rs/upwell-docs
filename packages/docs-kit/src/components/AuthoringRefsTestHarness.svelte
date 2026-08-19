<script lang="ts">
	import type { Snippet } from 'svelte';

	import type { DocsVersion } from '@upwell/docs-core/config';
	import { encodeSourcePath } from '@upwell/docs-core/references';
	import { parseVersion, versionId } from '@upwell/docs-core/semver';

	import { setDocsAuthoringContext } from '../authoring-context.svelte.ts';

	interface Props {
		version: DocsVersion;
		activeSource?: string;
		children: Snippet;
	}

	let { version, activeSource = 'framework', children }: Props = $props();

	function testVersion(id: string, release: string) {
		return { id: versionId(id), label: release, releaseVersion: parseVersion(release, 'Test version') };
	}

	const sourceVersions = {
		framework: [testVersion('root-v1', '1.0.0'), testVersion('root-v2', '2.0.0')],
		'framework-extra': [testVersion('extra-v1', '1.0.0'), testVersion('extra-latest', '9.0.0')]
	};
	const rootLatest = sourceVersions.framework.at(-1)!;

	export function navigate(next: DocsVersion): void {
		version = next;
	}

	function resolve(source = 'framework', requested?: string): DocsVersion {
		const versions = sourceVersions[source as keyof typeof sourceVersions];
		const target = requested
			? versions?.find((candidate) => candidate.id === requested)
			: source === activeSource
				? versions?.find((candidate) => candidate.id === version.id) ?? versions?.find((candidate) => candidate.releaseVersion.raw === version.releaseVersion.raw)
				: versions?.find((candidate) => candidate.releaseVersion.raw === version.releaseVersion.raw) ?? (source === 'framework' ? rootLatest : versions?.at(-1));

		if (!target) {
			throw new Error(`Unknown test source version ${source}@${requested ?? 'default'}.`);
		}

		return target;
	}

	setDocsAuthoringContext({
		defaultCrate: 'framework',
		version: () => version,
		guideHref: (slug) => `/docs/${resolve().id}/${slug}`,
		symbolHref: (path, source, requested) => `/docs/${source ?? 'framework'}/${resolve(source, requested).id}/symbols/${path}`,
		sourceHref: (path, source, requested) => `/docs/${source ?? 'framework'}/${resolve(source, requested).id}/src/${encodeSourcePath(path)}`
	});
</script>

{@render children()}
