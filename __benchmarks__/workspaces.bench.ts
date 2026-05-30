import { Bench } from 'tinybench'

import { filterWorkspaces, isValidPackageName, sortByDeps, sortByName } from '../src/workspaces.js'
import { makeWorkspaces } from './fixtures.js'

/**
 * Workspace discovery and ordering run at startup. `discover` is I/O bound and excluded
 * here; these pure transforms scale with the workspace count, so they run against a
 * sizeable synthetic monorepo.
 */
export function workspacesSuite(): Bench {
	const bench = new Bench({ name: 'workspaces — discovery & ordering', time: 500 })

	const small = makeWorkspaces(20)
	const large = makeWorkspaces(200)

	// Filter a quarter of the large set, requesting transitive deps each time.
	const patterns = large.filter((_, i) => i % 4 === 0).map((w) => `${w.name}...`)

	bench
		.add('sortByName: 200 workspaces', () => {
			sortByName(large)
		})
		.add('sortByDeps: 200 workspaces', () => {
			sortByDeps(large)
		})
		.add('sortByDeps: 20 workspaces', () => {
			sortByDeps(small)
		})
		.add('filterWorkspaces: transitive, 200 workspaces', () => {
			filterWorkspaces(large, patterns)
		})
		.add('isValidPackageName: scoped name', () => {
			isValidPackageName('@scope/some-package-name')
		})

	return bench
}
