import { defineConfig } from '@adonisjs/auth'
import { sessionUserProvider } from '@adonisjs/auth/session'
import { tokensUserProvider } from '@adonisjs/auth/access_tokens'
import type { InferAuthenticators, InferAuthEvents, Authenticators } from '@adonisjs/auth/types'
import { jwtGuard } from '@maximemrf/adonisjs-jwt'

const authConfig = defineConfig({
  /**
   * Default guard used when no guard is explicitly specified.
   */
  default: 'jwt',

  guards: {
    /**
     * Stateless JWT authentication with refresh tokens.
     */
    jwt: jwtGuard({
      provider: sessionUserProvider({
        model: () => import('#models/user'),
      }),
      /**
       * Short-lived access tokens: they can't be revoked before they expire.
       */
      tokenExpiresIn: '15m',
      /**
       * One-time refresh tokens, stored in the jwt_refresh_tokens table.
       */
      refreshTokenUserProvider: tokensUserProvider({
        tokens: 'refreshTokens',
        model: () => import('#models/user'),
      }),
      refreshTokenExpiresIn: '7d',
    }),
  },
})

export default authConfig

/**
 * Inferring types from the configured auth
 * guards.
 */
declare module '@adonisjs/auth/types' {
  export interface Authenticators extends InferAuthenticators<typeof authConfig> {}
}
declare module '@adonisjs/core/types' {
  interface EventsList extends InferAuthEvents<Authenticators> {}
}
