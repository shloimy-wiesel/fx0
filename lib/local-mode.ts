// Self-hosted mode (FX0_LOCAL=1): no Vercel sign-in, AI Gateway, Neon or Vercel
// Queues. One local account signs in without OAuth, model calls go to a server
// that speaks OpenAI Chat Completions (Ollama, vLLM, llama.cpp), accounts live in
// plain Postgres, and libfx keeps sessions in files (FX_SESSIONS_DIR).

export function localMode(): boolean {
  return process.env.FX0_LOCAL === '1'
}

// libfx accepts plain HTTP only on localhost, so it is given this base and the
// agent's fetch sends each request on to FX0_LOCAL_MODEL_URL, which may be
// another container (http://ollama:11434/v1).
export const LOCAL_PROVIDER_BASE = 'http://localhost/fx0-local/v1'

export function localModelUrl(): string {
  const url = process.env.FX0_LOCAL_MODEL_URL?.trim()
  if (!url) throw new Error('FX0_LOCAL_MODEL_URL is required when FX0_LOCAL=1')
  return url.endsWith('/') ? url.slice(0, -1) : url
}

// The models the picker offers: FX0_LOCAL_MODELS (comma separated), always
// including FX0_MODEL, which new chats start on.
export function localModels(): string[] {
  const listed = (process.env.FX0_LOCAL_MODELS ?? '').split(',').map((id) => id.trim()).filter(Boolean)
  const preferred = process.env.FX0_MODEL?.trim()
  return [...new Set(preferred ? [preferred, ...listed] : listed)]
}

function positive(value: string | undefined, fallback: number): number {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

// The custom provider libfx runs every local turn on. The server's context window
// is what libfx compacts against, so it must match the server's own setting.
export function localProvider() {
  const contextWindow = positive(process.env.FX0_LOCAL_CONTEXT_WINDOW, 32_768)
  const maxOutputTokens = Math.min(positive(process.env.FX0_LOCAL_MAX_OUTPUT_TOKENS, 16_384), contextWindow - 1)
  const supportsVision = process.env.FX0_LOCAL_VISION === '1'
  return {
    provider: {
      name: 'local',
      baseUrl: LOCAL_PROVIDER_BASE,
      models: Object.fromEntries(localModels().map((id) => [id, { contextWindow, maxOutputTokens, supportsToolUse: true, supportsVision }])),
    },
    // Not a key: libfx sends Gateway's x-session-id only to Gateway, so the libfx
    // session rides in the bearer token instead. The agent's fetch reads it to
    // find the chat, and localTransport swaps in FX0_LOCAL_MODEL_KEY, if any.
    credentials: ({ sessionId }: { sessionId?: string }) => ({ apiKey: `${LOCAL_SESSION_TOKEN}${sessionId ?? ''}` }),
  }
}

const LOCAL_SESSION_TOKEN = 'fx0-session:'

// The libfx session a local provider request was sent for, from its bearer token.
export function localSessionOf(authorization: string | null): string | null {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1]
  return token?.startsWith(LOCAL_SESSION_TOKEN) ? token.slice(LOCAL_SESSION_TOKEN.length) || null : null
}

// The single local account. Its "token" and "team" only satisfy the session
// checks the Gateway flow needs; nothing outside this server ever sees them.
export const LOCAL_TEAM = { teamId: 'team_local', teamSlug: 'local' }

export function localIdentity() {
  const email = process.env.FX0_LOCAL_USER_EMAIL?.trim() || 'local@localhost'
  return { userId: `local:${email}`, email, name: process.env.FX0_LOCAL_USER_NAME?.trim() || 'Local user' }
}
