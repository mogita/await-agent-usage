import { type Entry, readEntry, refresh } from './state'

// Single-entry timeline per the await author's guidance. The widget renders
// a `<Time style='timer' date={entry.date}/>` so we get a live ticking clock
// driven by iOS — every time iOS calls widgetTimeline, the new entry.date
// resets that timer. That gives empirical visibility into iOS's actual
// refresh cadence (timer growing past 15+ min = iOS isn't calling us;
// resetting every couple of minutes = iOS is refreshing well below the
// nominal floor). Pre-populating per-minute entries was telling iOS we were
// already covered for the next 16 minutes and pushing the next call out.
//
// Defensive 60s API throttle stays in case iOS triggers widgetTimeline in
// quick succession (e.g. shortly after a tap intent rebuilds the timeline).
// `manualRefresh` clears `lastUpdated` to bypass it.
const REFRESH_THROTTLE_MS = 60_000

export async function widgetTimeline(): Promise<Timeline<Entry>> {
	const lastUpdated = AwaitStore.num('lastUpdated', 0)
	const stale =
		lastUpdated === 0 || Date.now() - lastUpdated >= REFRESH_THROTTLE_MS
	if (stale) await refresh()

	const data = readEntry()
	const now = Date.now()
	const nextRetry = AwaitStore.num('nextRetry', 0)
	const update = nextRetry > now ? new Date(nextRetry) : new Date()

	return {
		entries: [{ date: new Date(now), ...data }],
		update,
	}
}
