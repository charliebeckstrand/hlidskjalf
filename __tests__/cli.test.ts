import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveOptions } from '../src/cli.js'

const ESC = String.fromCharCode(27)

const resolve = (argv: string[], config = {}) => resolveOptions(argv, config, '/repo')

afterEach(() => {
	vi.restoreAllMocks()
})

describe('resolveOptions', () => {
	it('falls back to the built-in defaults', () => {
		expect(resolve([])).toEqual({
			options: {
				root: '/repo',
				order: 'alphabetical',
				filter: undefined,
				title: 'Hlidskjalf',
				showMetrics: false,
				watch: true,
				theme: 'bifrost',
			},
			warnings: [],
		})
	})

	it('takes persisted config over defaults and flags over config', () => {
		const config = {
			order: 'run',
			title: 'Cfg',
			metrics: true,
			watch: false,
			theme: 'muspelheim',
		} as const

		expect(resolve([], config).options).toMatchObject({
			order: 'run',
			title: 'Cfg',
			showMetrics: true,
			watch: false,
			theme: 'muspelheim',
		})

		expect(
			resolve(
				['--order=alphabetical', '--title=Flag', '--metrics=false', '--watch', '--theme=ice'],
				config,
			).options,
		).toMatchObject({
			order: 'alphabetical',
			title: 'Flag',
			showMetrics: false,
			watch: true,
			theme: 'niflheim',
		})
	})

	it('reads bare and =true boolean flags as true', () => {
		expect(resolve(['--metrics', '--watch=true']).options).toMatchObject({
			showMetrics: true,
			watch: true,
		})
	})

	it('collects repeated filters and falls back to config when every one is invalid', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})

		expect(resolve(['--filter=web...', '--filter', '{api}']).options.filter).toEqual([
			'web...',
			'api',
		])

		expect(resolve(['--filter=Bad Name'], { filter: ['lib'] }).options.filter).toEqual(['lib'])
	})

	it('warns about and ignores an unknown order or theme, keeping the configured one', () => {
		const { options, warnings } = resolve(['--order=fast', '--theme=neon'], {
			order: 'run',
			theme: 'yggdrasil',
		})

		expect(options.order).toBe('run')

		expect(options.theme).toBe('yggdrasil')

		expect(warnings).toHaveLength(2)

		expect(warnings[0]).toContain('--order "fast"')

		expect(warnings[1]).toContain('--theme "neon"')
	})

	it('scrubs terminal escapes from the title flag and from echoed values', () => {
		const { options, warnings } = resolve([`--title=A${ESC}]0;pwned${ESC}\\B`, `--order=${ESC}[2J`])

		expect(options.title).toBe('AB')

		expect(warnings[0]).not.toContain(ESC)
	})

	it('ignores arguments it does not define', () => {
		expect(resolve(['--port=3000', 'extra']).warnings).toEqual([])
	})
})
