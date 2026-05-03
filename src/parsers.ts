export type Slot = { pct: number; reset: number; hasData: boolean }
export type Row = { label: string; slot: Slot }
export type ParsedUsage = { rows: Row[] }

const EMPTY: Slot = { pct: 0, reset: 0, hasData: false }

// Claude (claude.ai/api/organizations/<uuid>/usage)
//
// Observed shape:
//   five_hour:           {utilization, resets_at}
//   seven_day:           {utilization, resets_at}
//   seven_day_sonnet:    {utilization, resets_at}
//   seven_day_omelette:  {utilization, resets_at?}   "Claude Design" on the page
//   seven_day_opus / oauth_apps / cowork / ... :     null on most plans
type ClaudeSlotJson = { utilization?: number; resets_at?: string | null } | null
type ClaudeUsageJson = {
	five_hour?: ClaudeSlotJson
	seven_day?: ClaudeSlotJson
	seven_day_sonnet?: ClaudeSlotJson
	seven_day_omelette?: ClaudeSlotJson
}

function parseClaudeSlot(s: ClaudeSlotJson | null | undefined): Slot {
	if (!s || typeof s.utilization !== 'number') return EMPTY
	return {
		pct: s.utilization,
		reset: s.resets_at ? Date.parse(s.resets_at) : 0,
		hasData: true,
	}
}

export function parseClaudeUsage(json: unknown): ParsedUsage {
	const j = (json ?? {}) as ClaudeUsageJson
	return {
		rows: [
			{ label: '5h', slot: parseClaudeSlot(j.five_hour) },
			{ label: 'Week', slot: parseClaudeSlot(j.seven_day) },
			{ label: 'Sonnet', slot: parseClaudeSlot(j.seven_day_sonnet) },
			{ label: 'Design', slot: parseClaudeSlot(j.seven_day_omelette) },
		],
	}
}

export function parseUsage(raw: string): ParsedUsage {
	if (!raw) return { rows: [] }
	let json: unknown
	try {
		json = JSON.parse(raw)
	} catch {
		return { rows: [] }
	}
	return parseClaudeUsage(json)
}
