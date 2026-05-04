import { beforeEach, expect, test } from 'bun:test'
import { widgetTimeline } from './timeline'

let store: Map<string, unknown>
type MockResponse = { code: number; data: string }
let responses: MockResponse[]
let requestCount: number

beforeEach(() => {
	store = new Map()
	responses = []
	requestCount = 0

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
			requestCount++
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

test('widgetTimeline: emits exactly one entry', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 200, data: '{"five_hour":{"utilization":50}}' })

	const t = await widgetTimeline()
	expect(t.entries.length).toBe(1)
})

test('widgetTimeline: entry.date is ~now (so the live <Time/> timer starts at 0)', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 200, data: '{}' })

	const before = Date.now()
	const t = await widgetTimeline()
	const after = Date.now()

	const entryDate = t.entries[0]?.date.getTime() ?? 0
	expect(entryDate).toBeGreaterThanOrEqual(before)
	expect(entryDate).toBeLessThanOrEqual(after)
})

test('widgetTimeline: update is "ASAP" — close to call time', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 200, data: '{}' })

	const before = Date.now()
	const t = await widgetTimeline()
	const after = Date.now()

	const update = (t.update as Date).getTime()
	expect(update).toBeGreaterThanOrEqual(before)
	expect(update).toBeLessThanOrEqual(after)
})

test('widgetTimeline: skips network when last fetch is within throttle window', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	store.set('lastUpdated', Date.now() - 30_000) // 30s ago, well inside 60s

	await widgetTimeline()

	expect(requestCount).toBe(0)
})

test('widgetTimeline: fetches when last update is older than throttle window', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	store.set('lastUpdated', Date.now() - 90_000) // 90s ago, outside 60s
	responses.push({ code: 200, data: '{}' })

	await widgetTimeline()

	expect(requestCount).toBe(1)
})

test('widgetTimeline: fetches on first run (lastUpdated=0)', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 200, data: '{}' })

	await widgetTimeline()

	expect(requestCount).toBe(1)
})

test('widgetTimeline: still emits one entry in setup mode', async () => {
	const t = await widgetTimeline()

	expect(t.entries.length).toBe(1)
	const e = t.entries[0]
	expect(e?.setupMode).toBe(true)
	expect(e?.rows).toEqual([])
})

test('widgetTimeline: in backoff window, defers update to nextRetry', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	store.set('lastUpdated', Date.now() - 30_000) // recent — throttle skips fetch
	const retryAt = Date.now() + 5 * 60_000
	store.set('nextRetry', retryAt)
	store.set('failureCount', 3)

	const t = await widgetTimeline()

	expect(t.entries.length).toBe(1)
	expect((t.update as Date).getTime()).toBe(retryAt)
})

test('widgetTimeline: parsed slot data flows through to the entry', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({
		code: 200,
		data: JSON.stringify({
			five_hour: { utilization: 42, resets_at: '2026-05-02T22:00:00Z' },
		}),
	})

	const t = await widgetTimeline()

	const e = t.entries[0]
	expect(e?.rows[0]?.slot.pct).toBe(42)
	expect(e?.setupMode).toBe(false)
})
