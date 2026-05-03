<p align="center">
  <img src="screen.jpg?raw=true" width="390" height="300" />
  <h3 align="center">Agent Usage</h3>
</p>

An [Await](https://await-app.com) widget that surfaces real-time Claude.ai usage:

- 5-hour rolling session, 7-day rolling weekly and more
- Background updates with always fresh data
- Manual refresh for immediate updates

Each row shows percentage, time-to-reset, and a colored gauge: green below 70%,
orange 70 to under 85, red 85 and above.

[Await widget skill](https://github.com/await-widget/skills) is used to create this project.

## Installation

- Copy the content of `index.tsx` in the latest [release](https://github.com/mogita/await-agent-usage/releases).
- Open `Await` app, create a new widget, name it in your preferred way
- Tap the "..." menu on the top right, then "Paste to Index"

## Configuration

The widget reads its credentials from the widget's JSON data. On first run
the schema seeds itself with empty fields:

```json
{
	"sessionKey": ""
}
```

Set `sessionKey` to the value of the `sessionKey` cookie from `claude.ai`
(starts with `sk-ant-`). The widget will resolve and cache other fields
on the first successful refresh.

## Development

To initialize the project, run the following commands ([`bun`](https://bun.sh) is needed):

```sh
git clone https://github.com/mogita/await-agent-usage
cd await-agent-usage
bun install
```

Code formatting is handled by [biome](https://biomejs.dev); a pre-commit 
hook runs `bun run format` on staged files.

To build the project, run:

```
bun run build
```

Copy `build/index.tsx` onto the device through the Await app.

## Notes

GPT/Codex (`chatgpt.com/backend-api/wham/usage`) was attempted and dropped due
strict authentication that's beyond the scopes of the widget.

## License

MIT © [mogita](https://github.com/mogita)
