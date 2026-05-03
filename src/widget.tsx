import {
	Color,
	HStack,
	RoundedRectangle,
	Spacer,
	Text,
	VStack,
	ZStack,
} from 'await'
import { colorForPct, formatRemaining } from './format'
import type { Slot } from './parsers'
import type { Entry } from './state'

function bar(pct: number, color: RawColor, total: number): NativeView {
	const w = (Math.max(0, Math.min(100, pct)) / 100) * total
	return (
		<ZStack alignment='leading'>
			<RoundedRectangle
				rectRadius={2.5}
				fill={['gray', 0.25]}
				width={total}
				height={5}
			/>
			<RoundedRectangle rectRadius={2.5} fill={color} width={w} height={5} />
		</ZStack>
	)
}

function row(
	label: string,
	slot: Slot,
	nowMs: number,
	total: number,
): NativeView {
	const color = colorForPct(slot.pct)
	return (
		<VStack id={label} alignment='leading' spacing={3}>
			<HStack spacing={6} maxWidth>
				<Text
					value={label}
					fontSize={11}
					foreground='primary'
					fontWeight={600}
				/>
				<Text
					value={slot.hasData ? `${Math.round(slot.pct)}%` : '-'}
					fontSize={11}
					foreground={slot.hasData ? color : 'secondary'}
					fontWeight={700}
					fontDesign='rounded'
					monospacedDigit
				/>
				<Spacer minLength={4} />
				<Text
					value={
						slot.hasData && slot.reset > 0
							? formatRemaining(slot.reset, nowMs)
							: '-'
					}
					fontSize={10}
					foreground='secondary'
					fontDesign='rounded'
					monospacedDigit
				/>
			</HStack>
			{bar(slot.pct, slot.hasData ? color : 'gray', total)}
		</VStack>
	)
}

export function widget(entry: WidgetEntry<Entry>): NativeView {
	const { date, size, rows, failureCount, status, setupMode } = entry
	const nowMs = date.getTime()
	const total = Math.max(80, size.width - 24)
	const errorMode = failureCount > 0
	const anyData = rows.some((r) => r.slot.hasData)

	return (
		<ZStack alignment='topLeading' maxSides>
			<Color value='background' />
			<VStack alignment='leading' spacing={8} padding={12}>
				<HStack maxWidth>
					<Text
						value='Claude Usage'
						fontSize={11}
						foreground='primary'
						fontWeight={700}
					/>
					<Spacer />
					{setupMode || errorMode ? (
						<Text
							value='!'
							fontSize={12}
							foreground='orange'
							fontWeight={800}
						/>
					) : undefined}
				</HStack>
				{setupMode ? (
					<Text
						value='Set sessionKey in JSON data'
						fontSize={11}
						foreground='secondary'
						lineLimit={2}
					/>
				) : (
					rows.map((r) => row(r.label, r.slot, nowMs, total))
				)}
				{!setupMode && errorMode && !anyData ? (
					<Text
						value={status}
						fontSize={9}
						foreground='secondary'
						lineLimit={3}
					/>
				) : undefined}
			</VStack>
		</ZStack>
	)
}
