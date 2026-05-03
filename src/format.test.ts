import { expect, test } from 'bun:test'
import { colorForPct, formatNextUpdate, formatRemaining } from './format'

// colorForPct — boundaries from the spec: green <70, orange 70..<85, red >=85.

test('colorForPct: 0% is green', () => {
	expect(colorForPct(0)).toBe('green')
})

test('colorForPct: 69.99% is green (just below the orange boundary)', () => {
	expect(colorForPct(69.99)).toBe('green')
})

test('colorForPct: exactly 70% is orange', () => {
	expect(colorForPct(70)).toBe('orange')
})

test('colorForPct: 84.99% is orange', () => {
	expect(colorForPct(84.99)).toBe('orange')
})

test('colorForPct: exactly 85% is red', () => {
	expect(colorForPct(85)).toBe('red')
})

test('colorForPct: 100% is red', () => {
	expect(colorForPct(100)).toBe('red')
})

test('colorForPct: above 100% is red (does not crash)', () => {
	expect(colorForPct(150)).toBe('red')
})

// formatRemaining — uses absolute ms, computes days/hours/minutes from delta.

const NOW = 1_700_000_000_000 // arbitrary absolute reference
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

test('formatRemaining: reset == 0 returns "-"', () => {
	expect(formatRemaining(0, NOW)).toBe('-')
})

test('formatRemaining: reset in the past returns "now"', () => {
	expect(formatRemaining(NOW - 1000, NOW)).toBe('now')
})

test('formatRemaining: reset == now returns "now"', () => {
	expect(formatRemaining(NOW, NOW)).toBe('now')
})

test('formatRemaining: minutes only', () => {
	expect(formatRemaining(NOW + 35 * MIN, NOW)).toBe('35m')
})

test('formatRemaining: under one minute floors to 0m, still rendered', () => {
	expect(formatRemaining(NOW + 30_000, NOW)).toBe('0m')
})

test('formatRemaining: hours and minutes', () => {
	expect(formatRemaining(NOW + 3 * HOUR + 35 * MIN, NOW)).toBe('3h 35m')
})

test('formatRemaining: zero hours forces hours-segment when there are days', () => {
	expect(formatRemaining(NOW + 5 * DAY + 35 * MIN, NOW)).toBe('5d 0h 35m')
})

test('formatRemaining: full days+hours+minutes', () => {
	expect(formatRemaining(NOW + 5 * DAY + 4 * HOUR + 35 * MIN, NOW)).toBe(
		'5d 4h 35m',
	)
})

test('formatRemaining: single day rolls over correctly', () => {
	expect(formatRemaining(NOW + 1 * DAY + 1 * HOUR + 1 * MIN, NOW)).toBe(
		'1d 1h 1m',
	)
})

// formatNextUpdate — "Next in Xm" footer countdown.

test('formatNextUpdate: 0 returns empty (no schedule yet)', () => {
	expect(formatNextUpdate(0, NOW)).toBe('')
})

test('formatNextUpdate: scheduled in the past returns "soon"', () => {
	expect(formatNextUpdate(NOW - 1, NOW)).toBe('soon')
	expect(formatNextUpdate(NOW, NOW)).toBe('soon')
})

test('formatNextUpdate: under an hour renders minutes', () => {
	expect(formatNextUpdate(NOW + 1 * MIN, NOW)).toBe('1m')
	expect(formatNextUpdate(NOW + 14 * MIN, NOW)).toBe('14m')
	expect(formatNextUpdate(NOW + 59 * MIN, NOW)).toBe('59m')
})

test('formatNextUpdate: rounds the residual second up to the next minute', () => {
	// 5m 30s -> "6m" so the countdown reaches 1m before falling to "soon".
	expect(formatNextUpdate(NOW + 5 * MIN + 30_000, NOW)).toBe('6m')
})

test('formatNextUpdate: exact hour drops the minutes segment', () => {
	expect(formatNextUpdate(NOW + 60 * MIN, NOW)).toBe('1h')
	expect(formatNextUpdate(NOW + 2 * HOUR, NOW)).toBe('2h')
})

test('formatNextUpdate: hours and minutes', () => {
	expect(formatNextUpdate(NOW + 90 * MIN, NOW)).toBe('1h 30m')
})
