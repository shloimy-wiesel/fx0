import { randomBytes } from 'node:crypto'
import { sealData } from 'iron-session'
import { NextResponse, type NextRequest } from 'next/server'
import { upsertAccount } from '@/lib/accounts'
import { publicUser } from '@/lib/auth'
import { randomHandle, pkceChallenge } from '@/lib/auth-crypto'
import { localIdentity, localMode, LOCAL_TEAM } from '@/lib/local-mode'
import { getSessionOptions, sealSessionCookie, selectorCookie, type SessionData } from '@/lib/secure-session'
import { secureCookies, signedInHintCookie, signOutPendingCookie, SESSION_TTL_SECONDS } from '@/lib/session-cookies'
import { logAuthFailure, requestOrigin, SIGN_IN_UNAVAILABLE_PATH, FLOW_COOKIE_NAME, FLOW_COOKIE_OPTIONS, FLOW_TTL_SECONDS, type OAuthFlow } from '@/lib/auth-protocol'

// Self-hosted: the one local account signs in at once, with no provider. Its
// grant lasts as long as the cookie and has no refresh token to renew.
async function localSignIn(request: NextRequest): Promise<NextResponse> {
  const origin = requestOrigin(request)
  const loginAt = Date.now()
  const session: SessionData = { ...localIdentity(), ...LOCAL_TEAM, loginId: randomBytes(16).toString('hex'), loginAt,
    accessToken: 'local', expiresAt: loginAt + SESSION_TTL_SECONDS * 1000, isLoggedIn: true }
  await upsertAccount(publicUser(session))
  const response = NextResponse.redirect(new URL('/', origin))
  for (const cookie of [selectorCookie(session.loginId).setCookie, (await sealSessionCookie(session)).setCookie,
    signedInHintCookie(true, secureCookies()), signOutPendingCookie(false, secureCookies())]) {
    response.headers.append('set-cookie', cookie)
  }
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET(request: NextRequest) {
  // Read first: request data keeps this handler out of the build's prerender.
  const reauth = request.nextUrl.searchParams.get('reauth') === 'true'
  try {
    if (localMode()) return await localSignIn(request)
    const clientId = process.env.VERCEL_OAUTH_CLIENT_ID
    if (!clientId || !process.env.VERCEL_OAUTH_CLIENT_SECRET) throw new Error('OAuth is not configured')
    const origin = requestOrigin(request)
    const flow: OAuthFlow = { purpose: 'oauth', state: randomHandle(), nonce: randomHandle(), codeVerifier: randomHandle(), createdAt: Date.now() }
    const url = new URL('https://vercel.com/oauth/authorize')
    url.search = new URLSearchParams({
      client_id: clientId, redirect_uri: `${origin}/api/auth/callback`, response_type: 'code',
      scope: 'openid profile email offline_access', state: flow.state, nonce: flow.nonce,
      code_challenge: pkceChallenge(flow.codeVerifier), code_challenge_method: 'S256',
      ...(reauth ? { prompt: 'consent' } : {}),
    }).toString()
    const response = NextResponse.redirect(url)
    const value = await sealData(flow, { password: getSessionOptions().password, ttl: FLOW_TTL_SECONDS })
    response.cookies.set(FLOW_COOKIE_NAME, value, FLOW_COOKIE_OPTIONS)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    logAuthFailure('auth:signin:unavailable', error)
    return new NextResponse(null, { status: 307, headers: { Location: SIGN_IN_UNAVAILABLE_PATH, 'Cache-Control': 'no-store' } })
  }
}
