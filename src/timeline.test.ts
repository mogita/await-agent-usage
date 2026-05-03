import { beforeEach, expect, test } from 'bun:test'
import { widgetTimeline } from './timeline'

let store: Map<string, unknown>
type MockResponse = { code: number; data: string }
let responses: MockResponse[]

beforeEach(() => {
	store = new Map()
	responses = []

	const fakeStore = {
		get: <T>(k: string): T | undefined => store.get(k) as T | undefined,
		num: (k: string, def = 0): number =>
			store.has(k) ? (store.get(k) as number) : def,
		bool: (k: string, def = false): boolean =>
			store.has(k) ? (store.get(k) as boolean) : def,
		string: (k: string, def = ''): string =>
			store.has(k) ? (store.get(k) as string) : def,
		array: <T>(k: string, def: T[] = []): T[] =>
			store.has(k) ? (store.get(k) as T[]) : def,
		delete: (k: string): void => {
			store.delete(k)
		},
		set: (k: string, v: unknown): void => {
			store.set(k, v)
		},
	}

	const fakeNetwork = {
		request: async () => {
			const res = responses.shift()
			if (!res) throw new Error('no mock response queued')
			return res
		},
	}

	// biome-ignore lint/suspicious/noExplicitAny: runtime globals
	;(globalThis as any).AwaitStore = fakeStore
	// biome-ignore lint/suspicious/noExplicitAny: runtime globals
	;(globalThis as any).AwaitNetwork = fakeNetwork
})

const MIN = 60_000

test('widgetTimeline: emits 16 entries spaced one minute apart', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 200, data: '{"five_hour":{"utilization":50}}' })

	const before = Date.now()
	const t = await widgetTimeline()
	const after = Date.now()

	expect(t.entries.length).toBe(16)

	// First entry is ~now (within the wall-clock drift of awaiting refresh).
	const first = t.entries[0]?.date.getTime() ?? 0
	expect(first).toBeGreaterThanOrEqual(before)
	expect(first).toBeLessThanOrEqual(after)

	// Subsequent entries advance by exactly one minute.
	for (let i = 1; i < t.entries.length; i++) {
		const prev = t.entries[i - 1]?.date.getTime() ?? 0
		const curr = t.entries[i]?.date.getTime() ?? 0
		expect(curr - prev).toBe(MIN)
	}

	// `update` lands one minute after the last entry, i.e. 16 minutes from now.
	const last = t.entries[t.entries.length - 1]?.date.getTime() ?? 0
	const update = (t.update as Date).getTime()
	expect(update - last).toBe(MIN)
})

test('widgetTimeline: every entry carries the same parsed slot data', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({
		code: 200,
		data: JSON.stringify({
			five_hour: { utilization: 42, resets_at: '2026-05-02T22:00:00Z' },
		}),
	})

	const t = await widgetTimeline()

	for (const e of t.entries) {
		expect(e.rows[0]?.slot.pct).toBe(42)
		expect(e.setupMode).toBe(false)
	}
})

test('widgetTimeline: in setup mode, the per-minute entries still render', async () => {
	// No sessionKey -> refresh() short-circuits, but the timeline still emits
	// entries so the widget can show its setup state at every render slot.
	const t = await widgetTimeline()

	expect(t.entries.length).toBe(16)
	for (const e of t.entries) {
		expect(e.setupMode).toBe(true)
		expect(e.rows).toEqual([])
	}
})

test('widgetTimeline: in backoff window, emits a single entry and defers update', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	const retryAt = Date.now() + 5 * MIN
	store.set('nextRetry', retryAt)
	store.set('failureCount', 3)

	const t = await widgetTimeline()

	expect(t.entries.length).toBe(1)
	expect((t.update as Date).getTime()).toBe(retryAt)
})
