import { API_BASE, BROWSER_HEADERS } from './config'

function authHeaders(sessionKey: string): Record<string, string> {
	return { ...BROWSER_HEADERS, Cookie: `sessionKey=${sessionKey}` }
}

function snippet(data: string | undefined, max = 120): string {
	if (!data) return ''
	const trimmed = data.replace(/\s+/g, ' ').trim()
	return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed
}

export async function fetchOrgId(sessionKey: string): Promise<string> {
	const res = await AwaitNetwork.request(`${API_BASE}/organizations`, {
		method: 'GET',
		headers: authHeaders(sessionKey),
	})
	if (res.code !== 200) {
		throw new Error(`org list ${res.code} ${snippet(res.data)}`.trim())
	}
	const arr = JSON.parse(res.data) as Array<{ uuid?: string }>
	if (!Array.isArray(arr) || arr.length === 0) throw new Error('no org')
	const uuid = arr[0]?.uuid
	if (!uuid) throw new Error('no uuid')
	return String(uuid)
}

export async function fetchUsage(
	sessionKey: string,
	orgId: string,
): Promise<string> {
	const res = await AwaitNetwork.request(
		`${API_BASE}/organizations/${orgId}/usage`,
		{
			method: 'GET',
			headers: authHeaders(sessionKey),
		},
	)
	if (res.code !== 200) {
		throw new Error(`usage ${res.code} ${snippet(res.data)}`.trim())
	}
	return res.data
}
