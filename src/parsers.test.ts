import { expect, test } from 'bun:test'
import { parseClaudeUsage, parseUsage } from './parsers'

// Mirrors a real claude.ai/api/organizations/<uuid>/usage payload.
const fullJson = {
	five_hour: {
		utilization: 42,
		resets_at: '2026-05-02T22:00:00.704831+00:00',
	},
	seven_day: {
		utilization: 22,
		resets_at: '2026-05-07T23:00:00.704857+00:00',
	},
	seven_day_oauth_apps: null,
	seven_day_opus: null,
	seven_day_sonnet: {
		utilization: 0,
		resets_at: '2026-05-07T23:00:00.704868+00:00',
	},
	seven_day_cowork: null,
	seven_day_omelette: { utilization: 0, resets_at: null },
	tangelo: null,
	iguana_necktie: null,
	omelette_promotional: null,
}

test('parseClaudeUsage: returns four rows in 5h/Week/Sonnet/Design order', () => {
	const labels = parseClaudeUsage(fullJson).rows.map((r) => r.label)
	expect(labels).toEqual(['5h', 'Week', 'Sonnet', 'Design'])
})

test('parseClaudeUsage: maps utilization and resets_at for the 5h slot', () => {
	const r = parseClaudeUsage(fullJson).rows
	expect(r[0]).toBeDefined()
	expect(r[0]?.slot).toEqual({
		pct: 42,
		reset: Date.parse('2026-05-02T22:00:00.704831+00:00'),
		hasData: true,
	})
})

test('parseClaudeUsage: maps the Week slot (seven_day)', () => {
	const r = parseClaudeUsage(fullJson).rows
	expect(r[1]?.slot.pct).toBe(22)
	expect(r[1]?.slot.hasData).toBe(true)
	expect(r[1]?.slot.reset).toBe(Date.parse('2026-05-07T23:00:00.704857+00:00'))
})

test('parseClaudeUsage: Design (omelette) with null resets_at -> reset=0, hasData=true', () => {
	const r = parseClaudeUsage(fullJson).rows
	expect(r[3]?.slot).toEqual({
		pct: 0,
		reset: 0,
		hasData: true,
	})
})

test('parseClaudeUsage: missing fields produce empty slots (hasData=false)', () => {
	const r = parseClaudeUsage({}).rows
	for (const row of r) {
		expect(row.slot).toEqual({ pct: 0, reset: 0, hasData: false })
	}
})

test('parseClaudeUsage: explicit null fields produce empty slots', () => {
	const r = parseClaudeUsage({
		five_hour: null,
		seven_day: null,
		seven_day_sonnet: null,
		seven_day_omelette: null,
	}).rows
	for (const row of r) {
		expect(row.slot.hasData).toBe(false)
	}
})

test('parseClaudeUsage: non-numeric utilization is treated as missing', () => {
	const r = parseClaudeUsage({
		five_hour: { utilization: '42', resets_at: '2026-05-02T22:00:00Z' },
	}).rows
	expect(r[0]?.slot.hasData).toBe(false)
})

test('parseClaudeUsage: zero utilization with valid resets_at is hasData=true', () => {
	const r = parseClaudeUsage({
		five_hour: { utilization: 0, resets_at: '2026-05-02T22:00:00Z' },
	}).rows
	expect(r[0]?.slot.hasData).toBe(true)
	expect(r[0]?.slot.pct).toBe(0)
	expect(r[0]?.slot.reset).toBeGreaterThan(0)
})

test('parseClaudeUsage: null input returns empty slots, not crash', () => {
	const r = parseClaudeUsage(null).rows
	for (const row of r) {
		expect(row.slot.hasData).toBe(false)
	}
})

// parseUsage(raw) — string -> ParsedUsage entrypoint used by readEntry.

test('parseUsage: empty string returns no rows (used before first fetch)', () => {
	expect(parseUsage('').rows).toEqual([])
})

test('parseUsage: malformed JSON returns no rows instead of throwing', () => {
	expect(parseUsage('{not valid').rows).toEqual([])
})

test('parseUsage: round-trips a serialized response', () => {
	const out = parseUsage(JSON.stringify(fullJson))
	expect(out.rows.map((r) => r.label)).toEqual([
		'5h',
		'Week',
		'Sonnet',
		'Design',
	])
	expect(out.rows[0]?.slot.pct).toBe(42)
})
