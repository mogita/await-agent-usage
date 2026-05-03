export const API_BASE = 'https://claude.ai/api'

// claude.ai sits behind Cloudflare; without a populated User-Agent and
// Sec-Fetch-* set, the edge sometimes returns 403 even with a valid
// sessionKey cookie.
export const BROWSER_HEADERS: Record<string, string> = {
	Accept: 'application/json',
	'User-Agent':
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	Referer: 'https://claude.ai',
	Origin: 'https://claude.ai',
	'Sec-Fetch-Site': 'same-origin',
	'Sec-Fetch-Mode': 'cors',
	'Sec-Fetch-Dest': 'empty',
}
