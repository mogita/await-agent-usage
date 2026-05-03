import { type Entry, readEntry, refresh } from './state'

// The Await runtime clamps `update` to a multi-minute floor (~15:04). With a
// single entry, the time-to-reset countdown only ticks when the system
// refreshes us, which feels stuck. Pre-populating one entry per minute over
// the floor lets the widget render fresh `formatRemaining` values from each
// entry's `date` without any extra network calls.
//
// See demos/Stock and demos/Clock Analog in the await app author's repo: the
// same pattern (pre-tick the window, then schedule one refresh at the end).
const ENTRY_INTERVAL_MS = 60_000
const ENTRY_COUNT = 16
const WINDOW_MS = ENTRY_INTERVAL_MS * ENTRY_COUNT

export async function widgetTimeline(): Promise<Timeline<Entry>> {
	await refresh()
	const data = readEntry()
	const now = Date.now()
	const nextRetry = AwaitStore.num('nextRetry', 0)

	// Backoff active: emit a single entry and defer until nextRetry. No point
	// pre-ticking a countdown when there's no fresh data to show.
	if (nextRetry > now) {
		return {
			entries: [{ date: new Date(now), ...data }],
			update: new Date(nextRetry),
		}
	}

	const entries: Array<{ date: Date } & Entry> = []
	for (let i = 0; i < ENTRY_COUNT; i++) {
		entries.push({
			date: new Date(now + i * ENTRY_INTERVAL_MS),
			...data,
		})
	}
	return {
		entries,
		update: new Date(now + WINDOW_MS),
	}
}
