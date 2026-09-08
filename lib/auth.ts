import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

const toOrigin = (value?: string) => {
  if (!value) return undefined
  const normalized = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
  return normalized.replace(/\/$/, '')
}

const deploymentURL = toOrigin(process.env.VERCEL_URL)
const productionURL = toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL)
const baseURL = toOrigin(process.env.BETTER_AUTH_URL)
  ?? (process.env.VERCEL_ENV === 'production' ? productionURL : deploymentURL)
  ?? toOrigin(process.env.V0_RUNTIME_URL)
  ?? productionURL
  ?? 'http://localhost:3000'

const isDevelopment = process.env.NODE_ENV === 'development'

const trustedOriginCandidates = [
  baseURL,
  'http://localhost:3000',
  toOrigin(process.env.V0_RUNTIME_URL),
  toOrigin(process.env.V0_DEV_APP_URL),
  toOrigin(process.env.V0_BUILD_URL),
  toOrigin(process.env.V0_SANDBOX_URL),
  toOrigin(process.env.VERCEL_URL),
  toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
]
const configuredTrustedOrigins = Array.from(new Set(trustedOriginCandidates.filter((origin): origin is string => Boolean(origin))))

const isVercelPreviewHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname.endsWith('.vercel.app') ||
  hostname.endsWith('.v0.dev') ||
  hostname.endsWith('.v0.app') ||
  hostname.endsWith('.v0.build')

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
  baseURL,
  trustedOrigins: async (request) => {
    const requestOrigin = request ? new URL(request.url).origin : undefined
    const requestHost = request ? new URL(request.url).hostname : ''
    return requestOrigin && isVercelPreviewHost(requestHost)
      ? [...configuredTrustedOrigins, requestOrigin]
      : configuredTrustedOrigins
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
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
