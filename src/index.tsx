import { render } from 'ink'
import { App } from './app.js'
import { resolveOptions } from './cli.js'
import { loadConfig } from './config/index.js'
import { enterAltScreen, setTheme } from './ui/index.js'

const root = process.cwd()

const { options, warnings } = resolveOptions(process.argv.slice(2), await loadConfig(root), root)

// Printed before the alternate screen is entered, so they stay in the scrollback.
for (const warning of warnings) console.error(warning)

setTheme(options.theme)

// Render on the alternate screen so the dashboard never accumulates in the scrollback;
// restore the primary screen however we exit.
const restoreScreen = enterAltScreen()

let exitCode = 0

let failure: Error | undefined

try {
	const { waitUntilExit } = render(<App options={options} />, { exitOnCtrlC: false })

	// `App` rejects this (via Ink's `exit(error)`) on a fatal startup failure or when no
	// workspaces match, so the CLI surfaces a non-zero status instead of a silent success.
	await waitUntilExit()
} catch (err) {
	exitCode = 1

	failure = err instanceof Error ? err : new Error('startup failed')
} finally {
	restoreScreen()
}

// Print the failure only after the primary screen is restored — a message written while the
// alternate buffer was active would be discarded with it, exiting non-zero with no explanation.
if (failure) console.error(failure.message)

process.exit(exitCode)
