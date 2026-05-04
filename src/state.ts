import { fetchOrgId, fetchUsage } from './api'
import { parseUsage, type Row } from './parsers'

export type Entry = {
	rows: Row[]
	failureCount: number
	status: string
	setupMode: boolean
	lastUpdated: number
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

// User-tap intent. Bypasses both gates that widgetTimeline checks before
// hitting the API:
//   - `nextRetry` (exponential-backoff cooldown), and
//   - `lastUpdated` (60-second per-call throttle in widgetTimeline).
// Clearing both ensures the next widgetTimeline call (which iOS schedules
// immediately after an intent runs) actually fetches.
// Kept sync to match the await intent type contract.
export function manualRefresh(): void {
	AwaitStore.set('nextRetry', 0)
	AwaitStore.set('lastUpdated', 0)
}

export function readEntry(): Entry {
	const sessionKey = AwaitStore.string('sessionKey', '').trim()
	const raw = AwaitStore.string('lastResponse', '')
	return {
		rows: parseUsage(raw).rows,
		failureCount: AwaitStore.num('failureCount', 0),
		status: AwaitStore.string('status', ''),
		setupMode: !sessionKey,
		lastUpdated: AwaitStore.num('lastUpdated', 0),
	}
}
