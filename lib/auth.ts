import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

const toOrigin = (value?: string) => {
  if (!value) return undefined
  const normalized = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
  return normalized.replace(/\/$/, '')
}

const baseURL = toOrigin(process.env.BETTER_AUTH_URL)
  ?? toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  ?? toOrigin(process.env.VERCEL_URL)
  ?? toOrigin(process.env.V0_RUNTIME_URL)
  ?? 'http://localhost:3000'

const isDevelopment = process.env.NODE_ENV === 'development'
const trustedOriginCandidates = [
  baseURL,
  ...(isDevelopment ? [
    'http://localhost:3000',
    toOrigin(process.env.V0_RUNTIME_URL),
    toOrigin(process.env.V0_DEV_APP_URL),
    toOrigin(process.env.V0_BUILD_URL),
    toOrigin(process.env.V0_SANDBOX_URL),
  ] : []),
  toOrigin(process.env.VERCEL_URL),
  toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
]
const trustedOrigins = Array.from(new Set(trustedOriginCandidates.filter((origin): origin is string => Boolean(origin))))

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL,
  trustedOrigins,
  emailAndPassword: {
    enabled: false,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  user: { modelName: 'user' },
  session: { modelName: 'session' },
  account: { modelName: 'account' },
  verification: { modelName: 'verification' },
  ...(isDevelopment
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
