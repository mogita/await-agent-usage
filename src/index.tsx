import { type Entry, manualRefresh } from './state'
import { widgetTimeline } from './timeline'
import { widget } from './widget'

const app = Await.define({
	widget: (entry: WidgetEntry<Entry>): NativeView =>
		widget({ ...entry, refreshIntent: app.manualRefresh() }),
	widgetTimeline,
	widgetIntents: { manualRefresh },
})
