export function colorForPct(pct: number): RawColor {
	if (pct >= 85) return 'red'
	if (pct >= 70) return 'orange'
	return 'green'
}

// Renders a "Next in Xm / Xh Ym / soon" countdown to a future timestamp.
// Returns '' when there is no schedule yet (`nextMs <= 0`) so callers can
// fall back to a static "Refresh" label.
export function formatNextUpdate(nextMs: number, nowMs: number): string {
	if (nextMs <= 0) return ''
	const diff = nextMs - nowMs
	if (diff <= 0) return 'soon'
	const min = Math.ceil(diff / 60_000)
	if (min < 60) return `${min}m`
	const hr = Math.floor(min / 60)
	const m = min % 60
	return m === 0 ? `${hr}h` : `${hr}h ${m}m`
}

export function formatRemaining(resetMs: number, nowMs: number): string {
	if (resetMs <= 0) return '-'
	const ms = resetMs - nowMs
	if (ms <= 0) return 'now'
	const totalMin = Math.floor(ms / 60000)
	const days = Math.floor(totalMin / 1440)
	const hours = Math.floor((totalMin % 1440) / 60)
	const mins = totalMin % 60
	const parts: string[] = []
	if (days > 0) parts.push(`${days}d`)
	if (days > 0 || hours > 0) parts.push(`${hours}h`)
	parts.push(`${mins}m`)
	return parts.join(' ')
}
