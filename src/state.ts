import { fetchOrgId, fetchUsage } from './api'
import { parseUsage, type Row } from './parsers'

// Used to estimate when iOS will next call widgetTimeline. WidgetKit's floor
// is ~15:04, so this is the earliest a successful auto-refresh can happen.
const REFRESH_FLOOR_MS = 15 * 60 * 1000

export type Entry = {
	rows: Row[]
	failureCount: number
	status: string
	setupMode: boolean
	lastUpdated: number
	// Estimated unix-ms timestamp of the next refresh. 0 if we have no
	// reference yet (no successful fetch and not in backoff).
	nextScheduled: number
}

function ensureSchema(): void {
	// Seed user-editable fields on first run so the schema shows up in the
	// JSON data editor instead of leaving the user to guess key names.
	if (AwaitStore.get('sessionKey') === undefined) {
		AwaitStore.set('sessionKey', '')
	}
	if (AwaitStore.get('orgId') === undefined) AwaitStore.set('orgId', '')
}

function recordSuccess(): void {
	AwaitStore.set('failureCount', 0)
	AwaitStore.set('nextRetry', 0)
	AwaitStore.set('status', 'ok')
	AwaitStore.set('lastUpdated', Date.now())
}

function recordFailure(msg: string): void {
	const count = AwaitStore.num('failureCount', 0) + 1
	AwaitStore.set('failureCount', count)
	const delaySec = Math.min(60 * 2 ** (count - 1), 3600)
	AwaitStore.set('nextRetry', Date.now() + delaySec * 1000)
	AwaitStore.set('status', msg)
}

export async function refresh(): Promise<void> {
	// sessionKey + orgId come from the widget's JSON data so users can edit them
	// in the Await app without rebuilding. The raw API response is cached in
	// AwaitStore; parsing happens on read.
	ensureSchema()
	const sessionKey = AwaitStore.string('sessionKey', '').trim()
	if (!sessionKey) {
		AwaitStore.set('status', 'set sessionKey in JSON data')
		AwaitStore.set('failureCount', 0)
		return
	}
	if (Date.now() < AwaitStore.num('nextRetry', 0)) return
	try {
		let orgId = AwaitStore.string('orgId', '').trim()
		if (!orgId) {
			orgId = await fetchOrgId(sessionKey)
			AwaitStore.set('orgId', orgId)
		}
		const raw = await fetchUsage(sessionKey, orgId)
		AwaitStore.set('lastResponse', raw)
		recordSuccess()
	} catch (e) {
		const msg = String((e as Error)?.message || e)
		// Auth or stale-uuid responses; clear cached uuid so next attempt resolves it.
		if (/4(01|03|04)/.test(msg)) AwaitStore.set('orgId', '')
		recordFailure(msg)
	}
}

// User-tap intent. Clears any active backoff window so the next
// widgetTimeline call (which iOS schedules immediately after an intent runs)
// fetches fresh data instead of bailing on the backoff guard. Kept sync to
// match the await intent type contract.
export function manualRefresh(): void {
	AwaitStore.set('nextRetry', 0)
}

export function readEntry(): Entry {
	const sessionKey = AwaitStore.string('sessionKey', '').trim()
	const raw = AwaitStore.string('lastResponse', '')
	const lastUpdated = AwaitStore.num('lastUpdated', 0)
	const nextRetry = AwaitStore.num('nextRetry', 0)

	// Where the next refresh is expected: a backoff window if one is set,
	// otherwise iOS's WidgetKit floor on top of the last successful fetch.
	let nextScheduled = 0
	if (nextRetry > 0) {
		nextScheduled = nextRetry
	} else if (lastUpdated > 0) {
		nextScheduled = lastUpdated + REFRESH_FLOOR_MS
	}

	return {
		rows: parseUsage(raw).rows,
		failureCount: AwaitStore.num('failureCount', 0),
		status: AwaitStore.string('status', ''),
		setupMode: !sessionKey,
		lastUpdated,
		nextScheduled,
	}
}
