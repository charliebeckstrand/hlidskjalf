import { cleanup, render } from 'ink-testing-library'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import type { Options, Status, WorkspaceProcess } from '../src/types.js'

// The App owns its store (constructed in a `useState` initializer), so there is no prop seam
// to inject through. Mock the factory and hand back a fully stubbed store whose control
// methods are spies: every assertion below reads "this keystroke called that store method
// for the selected process", which is exactly the wiring `useInput` is responsible for.
const mock = vi.hoisted(() => {
	const store = {
		getSnapshot: vi.fn<() => WorkspaceProcess[]>(() => []),
		subscribe: vi.fn(() => () => {}),
		start: vi.fn(async () => true),
		shutdown: vi.fn(async () => {}),
		stopProcess: vi.fn(),
		restartProcess: vi.fn(),
		pauseProcess: vi.fn(),
		resumeProcess: vi.fn(),
		killProcess: vi.fn(),
		clearLogs: vi.fn(),
		addWorkspace: vi.fn(),
		removeWorkspace: vi.fn(),
	}

	return { store, createStore: vi.fn(() => store) }
})

vi.mock('../src/store/index.js', () => ({ createStore: mock.createStore }))

const options: Options = {
	root: '/repo',
	order: 'run',
	title: 'Test',
	showMetrics: false,
	watch: false,
	theme: 'bifrost',
}

const ARROW_UP = '\u001B[A'
const ARROW_DOWN = '\u001B[B'
const ESC = '\u001B'
const CTRL_C = '\u0003'

function proc(name: string, status: Status = 'ready'): WorkspaceProcess {
	return { workspace: { name, kind: 'package', deps: [] }, status, logs: [] }
}

// `useInput` reads `cursor`/`processes` from the render closure, so a state change must flush
// to a re-render before the next keystroke sees it. Yield a macrotask between writes.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Render the App, wait past the loading phase, and return the harness plus a key-press helper. */
async function setup(processes: WorkspaceProcess[] = [proc('alpha'), proc('beta'), proc('gamma')]) {
	mock.store.getSnapshot.mockReturnValue(processes)

	const instance = render(<App options={options} />)

	const press = async (data: string) => {
		instance.stdin.write(data)

		await flush()
	}

	// `start()` resolves true, flipping phase to 'running'; wait until the Loading screen clears.
	await vi.waitFor(() => {
		expect(instance.lastFrame()).not.toContain('Discovering workspaces')
	})

	return { ...instance, press }
}

beforeEach(() => {
	mock.store.start.mockResolvedValue(true)
})

afterEach(() => {
	// Unmount every rendered App so its effect cleanup detaches the SIGTERM listener it added;
	// without this the listeners pile up across tests and trip Node's max-listeners warning.
	cleanup()

	vi.clearAllMocks()
})

describe('quit', () => {
	// `q` and ctrl-c both route through `stop()`, which shuts the store down before exiting.
	// (The unmount that exit triggers also calls `shutdown`, so the count isn't asserted — the
	// real store is idempotent on `ctx.stopping`; the input layer's job is just to initiate it.)
	it('shuts down on q', async () => {
		const { press } = await setup()

		await press('q')

		expect(mock.store.shutdown).toHaveBeenCalled()
	})

	it('shuts down on ctrl-c', async () => {
		const { press } = await setup()

		await press(CTRL_C)

		expect(mock.store.shutdown).toHaveBeenCalled()
	})
})

describe('help overlay', () => {
	it('toggles open with ? and captures other input until Esc', async () => {
		const { press, lastFrame } = await setup()

		await press('?')

		expect(lastFrame()).toContain('Keybindings')

		// While help is open it swallows control keys.
		await press('s')

		expect(mock.store.stopProcess).not.toHaveBeenCalled()

		await press(ESC)

		expect(lastFrame()).not.toContain('Keybindings')

		// Closed again: the same key now dispatches.
		await press('s')

		expect(mock.store.stopProcess).toHaveBeenCalledWith('alpha')
	})

	it('toggles closed with a second ?', async () => {
		const { press, lastFrame } = await setup()

		await press('?')

		expect(lastFrame()).toContain('Keybindings')

		await press('?')

		expect(lastFrame()).not.toContain('Keybindings')
	})
})

describe('navigation', () => {
	it('moves the cursor down with j and arrow keys', async () => {
		const { press } = await setup()

		await press('j')

		await press('s')

		expect(mock.store.stopProcess).toHaveBeenCalledWith('beta')

		await press(ARROW_DOWN)

		await press('s')

		expect(mock.store.stopProcess).toHaveBeenLastCalledWith('gamma')
	})

	it('moves the cursor up with k and arrow keys', async () => {
		const { press } = await setup()

		await press(ARROW_DOWN)

		await press(ARROW_DOWN)

		await press('k')

		await press('s')

		expect(mock.store.stopProcess).toHaveBeenCalledWith('beta')

		await press(ARROW_UP)

		await press('s')

		expect(mock.store.stopProcess).toHaveBeenLastCalledWith('alpha')
	})

	it('clamps at the top', async () => {
		const { press } = await setup()

		await press('k')

		await press('k')

		await press('s')

		expect(mock.store.stopProcess).toHaveBeenCalledWith('alpha')
	})

	it('clamps at the bottom', async () => {
		const { press } = await setup()

		await press('j')

		await press('j')

		await press('j')

		await press('j')

		await press('s')

		expect(mock.store.stopProcess).toHaveBeenCalledWith('gamma')
	})
})

describe('process controls', () => {
	it('maps keys to store actions on the selected process', async () => {
		const { press } = await setup()

		await press('x')

		expect(mock.store.killProcess).toHaveBeenCalledWith('alpha')

		await press('r')

		expect(mock.store.restartProcess).toHaveBeenCalledWith('alpha')

		await press('c')

		expect(mock.store.clearLogs).toHaveBeenCalledWith('alpha')
	})

	it('stops a running process and restarts a stopped one', async () => {
		const running = await setup([proc('alpha', 'ready')])

		await running.press('s')

		expect(mock.store.stopProcess).toHaveBeenCalledWith('alpha')

		expect(mock.store.restartProcess).not.toHaveBeenCalled()

		running.unmount()

		vi.clearAllMocks()

		const stopped = await setup([proc('alpha', 'stopped')])

		await stopped.press('s')

		expect(mock.store.restartProcess).toHaveBeenCalledWith('alpha')

		expect(mock.store.stopProcess).not.toHaveBeenCalled()
	})

	it('pauses a running process and resumes a paused one', async () => {
		const running = await setup([proc('alpha', 'ready')])

		await running.press('p')

		expect(mock.store.pauseProcess).toHaveBeenCalledWith('alpha')

		expect(mock.store.resumeProcess).not.toHaveBeenCalled()

		running.unmount()

		vi.clearAllMocks()

		const paused = await setup([proc('alpha', 'paused')])

		await paused.press('p')

		expect(mock.store.resumeProcess).toHaveBeenCalledWith('alpha')

		expect(mock.store.pauseProcess).not.toHaveBeenCalled()
	})
})

describe('empty process list', () => {
	it('ignores navigation and control keys', async () => {
		const { press } = await setup([])

		await press('j')

		await press('s')

		await press('x')

		expect(mock.store.stopProcess).not.toHaveBeenCalled()

		expect(mock.store.killProcess).not.toHaveBeenCalled()
	})
})
