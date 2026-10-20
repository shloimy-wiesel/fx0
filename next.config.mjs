import { withBotId } from 'botid/next/config'

/** @type {import('next').NextConfig} */
const nextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ['libfx'],
  turbopack: { root: import.meta.dirname },
  // The DESIGN.md catalog is read from disk when a new chat picks one.
  outputFileTracingIncludes: { '/api/prompt': ['./lib/design-md/*.md'] },
  env: {
    NEXT_PUBLIC_FX0_FREE_PROMPTS: process.env.FX0_FREE_PROMPTS === '1' ? '1' : '0',
    // Self-hosted builds sign in locally, with no Vercel account.
    NEXT_PUBLIC_FX0_LOCAL: process.env.FX0_LOCAL === '1' ? '1' : '0',
  },
}

export default withBotId(nextConfig)
