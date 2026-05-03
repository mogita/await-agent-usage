import { beforeEach, expect, test } from 'bun:test'
import { manualRefresh, readEntry, refresh } from './state'

// AwaitStore + AwaitNetwork are declared as globals by the runtime types but
// don't exist outside the device. Tests stub them with in-memory fakes and
// reset between tests via beforeEach.

let store: Map<string, unknown>
type MockResponse = { code: number; data: string }
let responses: MockResponse[]
let requestLog: Array<{ url: string }>

beforeEach(() => {
	store = new Map()
	responses = []
	requestLog = []

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
		request: async (url: string) => {
			requestLog.push({ url })
			const res = responses.shift()
			if (!res) throw new Error(`no mock response queued for ${url}`)
			return res
		},
	}

	// biome-ignore lint/suspicious/noExplicitAny: runtime globals
	;(globalThis as any).AwaitStore = fakeStore
	// biome-ignore lint/suspicious/noExplicitAny: runtime globals
	;(globalThis as any).AwaitNetwork = fakeNetwork
})

// --- ensureSchema (exercised by refresh) ---

test('refresh: ensureSchema seeds sessionKey and orgId on first run', async () => {
	await refresh()
	expect(store.get('sessionKey')).toBe('')
	expect(store.get('orgId')).toBe('')
})

test('refresh: ensureSchema does not clobber existing sessionKey', async () => {
	store.set('sessionKey', 'sk-ant-existing')
	responses.push({ code: 200, data: '[{"uuid":"u-1"}]' })
	responses.push({ code: 200, data: '{}' })
	await refresh()
	expect(store.get('sessionKey')).toBe('sk-ant-existing')
})

// --- setup-mode short-circuit ---

test('refresh: empty sessionKey skips network and writes setup status', async () => {
	await refresh()
	expect(requestLog).toEqual([])
	expect(store.get('status')).toBe('set sessionKey in JSON data')
	expect(store.get('failureCount')).toBe(0)
})

// --- backoff window ---

test('refresh: nextRetry in the future blocks the network call', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('nextRetry', Date.now() + 60_000)
	await refresh()
	expect(requestLog).toEqual([])
})

// --- success path ---

test('refresh: with sessionKey but no orgId, fetches orgId then usage', async () => {
	store.set('sessionKey', 'sk-ant-x')
	responses.push({
		code: 200,
		data: JSON.stringify([{ uuid: 'org-uuid-1' }]),
	})
	responses.push({
		code: 200,
		data: JSON.stringify({
			five_hour: { utilization: 42, resets_at: '2026-05-02T22:00:00Z' },
		}),
	})

	await refresh()

	expect(requestLog.length).toBe(2)
	expect(requestLog[0]?.url).toContain('/organizations')
	expect(requestLog[1]?.url).toContain('/organizations/org-uuid-1/usage')
	expect(store.get('orgId')).toBe('org-uuid-1')
	expect(store.get('lastResponse')).toContain('utilization')
})

test('refresh: cached orgId skips the orgId fetch', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 200, data: '{"five_hour":{"utilization":10}}' })

	await refresh()

	expect(requestLog.length).toBe(1)
	expect(requestLog[0]?.url).toContain('/organizations/org-cached/usage')
})

test('refresh: success resets failureCount and nextRetry', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	store.set('failureCount', 4)
	store.set('nextRetry', Date.now() - 1000)
	responses.push({ code: 200, data: '{}' })

	await refresh()

	expect(store.get('failureCount')).toBe(0)
	expect(store.get('nextRetry')).toBe(0)
	expect(store.get('status')).toBe('ok')
})

test('refresh: success stamps lastUpdated with the current time', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 200, data: '{}' })

	const before = Date.now()
	await refresh()
	const after = Date.now()

	const lastUpdated = store.get('lastUpdated') as number
	expect(lastUpdated).toBeGreaterThanOrEqual(before)
	expect(lastUpdated).toBeLessThanOrEqual(after)
})

test('refresh: failure does NOT stamp lastUpdated (preserves prior value)', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	store.set('lastUpdated', 1234567890)
	responses.push({ code: 500, data: 'boom' })

	await refresh()

	expect(store.get('lastUpdated')).toBe(1234567890)
})

// --- failure path ---

test('refresh: 401 on usage clears orgId and increments failureCount', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-stale')
	responses.push({ code: 401, data: '{"error":"unauthorized"}' })

	await refresh()

	expect(store.get('orgId')).toBe('')
	expect(store.get('failureCount')).toBe(1)
	expect(store.get('status') as string).toContain('401')
})

test('refresh: 5xx records failure but does not clear orgId', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	responses.push({ code: 503, data: 'service unavailable' })

	await refresh()

	expect(store.get('orgId')).toBe('org-cached')
	expect(store.get('failureCount')).toBe(1)
})

test('refresh: failure backoff doubles up to 1 hour cap', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	store.set('failureCount', 0)

	const before = Date.now()
	responses.push({ code: 500, data: 'boom' })
	await refresh()
	const delay1 = (store.get('nextRetry') as number) - before
	expect(delay1).toBeGreaterThanOrEqual(60_000)
	expect(delay1).toBeLessThanOrEqual(60_000 + 50)

	// Force eligible-now to bypass backoff and try again.
	store.set('nextRetry', 0)
	const before2 = Date.now()
	responses.push({ code: 500, data: 'boom' })
	await refresh()
	const delay2 = (store.get('nextRetry') as number) - before2
	expect(delay2).toBeGreaterThanOrEqual(120_000) // 60s * 2^1
	expect(delay2).toBeLessThanOrEqual(120_000 + 50)
})

// --- readEntry ---

test('readEntry: setupMode is true when sessionKey is missing', () => {
	const e = readEntry()
	expect(e.setupMode).toBe(true)
	expect(e.rows).toEqual([])
})

test('readEntry: setupMode is false when sessionKey is set', () => {
	store.set('sessionKey', 'sk-ant-x')
	const e = readEntry()
	expect(e.setupMode).toBe(false)
})

test('readEntry: parses cached response into the four rows', () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set(
		'lastResponse',
		JSON.stringify({
			five_hour: { utilization: 42, resets_at: '2026-05-02T22:00:00Z' },
			seven_day: { utilization: 22, resets_at: '2026-05-07T23:00:00Z' },
			seven_day_sonnet: {
				utilization: 0,
				resets_at: '2026-05-07T23:00:00Z',
			},
			seven_day_omelette: { utilization: 0, resets_at: null },
		}),
	)

	const e = readEntry()

	expect(e.rows.map((r) => r.label)).toEqual(['5h', 'Week', 'Sonnet', 'Design'])
	expect(e.rows[0]?.slot.pct).toBe(42)
	expect(e.rows[3]?.slot.reset).toBe(0) // null resets_at
	expect(e.rows[3]?.slot.hasData).toBe(true) // utilization is a number
})

test('readEntry: empty cached response yields no rows', () => {
	store.set('sessionKey', 'sk-ant-x')
	const e = readEntry()
	expect(e.rows).toEqual([])
})

// --- nextScheduled ---

test('readEntry: nextScheduled is 0 when never refreshed and no backoff', () => {
	store.set('sessionKey', 'sk-ant-x')
	expect(readEntry().nextScheduled).toBe(0)
})

test('readEntry: nextScheduled = lastUpdated + 15min after a successful fetch', () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('lastUpdated', 1_700_000_000_000)
	expect(readEntry().nextScheduled).toBe(1_700_000_000_000 + 15 * 60_000)
})

test('readEntry: nextScheduled = nextRetry while in backoff (overrides lastUpdated)', () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('lastUpdated', 1_700_000_000_000)
	store.set('nextRetry', 1_700_000_000_000 + 30 * 60_000)
	expect(readEntry().nextScheduled).toBe(1_700_000_000_000 + 30 * 60_000)
})

// --- manualRefresh ---

test('manualRefresh: clears nextRetry so the next fetch is not gated', () => {
	store.set('nextRetry', Date.now() + 5 * 60_000)
	manualRefresh()
	expect(store.get('nextRetry')).toBe(0)
})

test('manualRefresh: followed by refresh() actually fetches', async () => {
	store.set('sessionKey', 'sk-ant-x')
	store.set('orgId', 'org-cached')
	// Pretend we're deep into a backoff window.
	store.set('nextRetry', Date.now() + 30 * 60_000)
	store.set('failureCount', 5)

	manualRefresh()
	responses.push({ code: 200, data: '{"five_hour":{"utilization":7}}' })
	await refresh()

	expect(requestLog.length).toBe(1)
	expect(store.get('lastResponse')).toContain('utilization')
	expect(store.get('failureCount')).toBe(0)
})
