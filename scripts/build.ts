import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'

const minify = Bun.argv.includes('--minify')

// Topological order: dependencies first, dependents last.
const FILES = [
	'src/config.ts',
	'src/format.ts',
	'src/parsers.ts',
	'src/api.ts',
	'src/state.ts',
	'src/widget.tsx',
	'src/timeline.ts',
	'src/index.tsx',
]

const NAMED_IMPORT =
	/import\s+(?:type\s+)?\{([^}]*?)\}\s+from\s+(['"][^'"]+['"])[ \t]*;?/g

await rm('./build', { recursive: true, force: true })
await mkdir('./build', { recursive: true })

const awaitNames = new Set<string>()
const segments: string[] = []

for (const path of FILES) {
	let content = await readFile(path, 'utf8')

	// Normalize multi-line named imports to a single line so subsequent
	// line-based regexes can match them.
	content = content.replace(
		NAMED_IMPORT,
		(_match, names: string, source: string) => {
			const oneline = names.replace(/\s+/g, ' ').trim()
			return `import {${oneline}} from ${source};`
		},
	)

	// Collect 'await' import names so we can hoist a single combined import.
	for (const match of content.matchAll(
		/^import\s+\{([^}]*)\}\s+from\s+['"]await['"]\s*;?\s*$/gm,
	)) {
		for (const raw of match[1]!.split(',')) {
			const name = raw.trim()
			if (name) awaitNames.add(name)
		}
	}

	// Strip 'await' imports (they will be hoisted at the top).
	content = content.replace(
		/^import\s+\{[^}]*\}\s+from\s+['"]await['"]\s*;?\s*\n?/gm,
		'',
	)

	// Strip local imports (./ or ../).
	content = content.replace(
		/^import\s+(?:type\s+)?\{[^}]*\}\s+from\s+['"]\.\.?\/[^'"]*['"]\s*;?\s*\n?/gm,
		'',
	)

	// Strip 'export' keyword from top-level declarations. Each file becomes a
	// section of one combined script; nothing actually re-exports anything.
	content = content.replace(
		/^export\s+(?=(?:type\s|const\s|function\s|class\s|interface\s|enum\s|let\s|var\s|async\s+function\s))/gm,
		'',
	)

	segments.push(content.trim())
}

const pkg = JSON.parse(await readFile('./package.json', 'utf8'))
const version: string = pkg.version ?? '0.0.0'

const awaitImport = `import {${[...awaitNames].sort().join(', ')}} from 'await';`
const pad = (n: number) => String(n).padStart(2, '0')
const d = new Date()
// Block comments with no colons. The iPhone-side esbuild rejects '// Built: ...'
// at line 1 col 7 (something about the colon in a leading line comment),
// while a /* */ block with hyphen separators parses cleanly.
const builtAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s`
const header = `/* Built ${builtAt} */`
const versionLine = `/* Version: ${version} */`
const about = `/* About: agent-usage shows real-time Claude.ai 5-hour and weekly usage. */`
const author = `/* Author: @mogita */`
const license = `/* License: MIT */`

const source = `${awaitImport}\n\n${segments.join('\n\n')}\n`

// In dev (no flag): emit the concatenated source as-is. The iPhone runtime
// has its own esbuild and accepts TS+JSX, so no transform is needed; keeping
// types and comments makes the output readable in the editor.
//
// With --minify: write a temp file, run esbuild on it, replace the body with
// minified output. --jsx=preserve keeps the JSX tree intact (component
// identifiers like Text/VStack stay capitalized so JSX continues to treat
// them as components rather than HTML-style strings).
let body = source.trimEnd()
if (minify) {
	const tmpPath = './build/_combined.tsx'
	await writeFile(tmpPath, source)

	const proc = Bun.spawn(
		[
			'bunx',
			'esbuild',
			tmpPath,
			'--minify',
			'--bundle=false',
			'--jsx=preserve',
			'--charset=utf8',
			'--log-level=error',
		],
		{ stderr: 'pipe', stdout: 'pipe' },
	)
	const stdout = (await new Response(proc.stdout).text()).trim()
	const stderr = await new Response(proc.stderr).text()
	const exitCode = await proc.exited
	if (exitCode !== 0) {
		console.error(stderr)
		console.error('Minify FAILED.')
		process.exit(1)
	}
	await rm(tmpPath)
	body = stdout
}

const output = `${header}\n${versionLine}\n${about}\n${author}\n${license}\n${body}\n`
await writeFile('./build/index.tsx', output)

console.log(
	`Built build/index.tsx (${output.length} bytes${minify ? ', minified' : ''})`,
)
