export function colorForPct(pct: number): RawColor {
	if (pct >= 85) return 'red'
	if (pct >= 70) return 'orange'
	return 'green'
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
