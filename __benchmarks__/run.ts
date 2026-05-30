import type { Bench } from 'tinybench'

/**
 * Run a configured benchmark suite and print its results. Shared by every suite so output
 * formatting and error handling stay consistent — individual files only declare their cases.
 *
 * tinybench warms each task up before measuring and reports a relative margin of
 * error, so a low `rme` (the ± column) means the numbers are stable enough to
 * compare across runs. Treat results with a large margin of error as noise.
 */
export async function runSuite(bench: Bench): Promise<void> {
	process.stdout.write(`\n${bench.name ?? 'benchmark'}\n`)

	await bench.run()

	console.table(bench.table())

	for (const task of bench.tasks) {
		const result = task.result

		if (result?.state === 'errored') {
			console.error(`  ✗ ${task.name}: ${result.error.message}`)

			process.exitCode = 1
		}
	}
}
