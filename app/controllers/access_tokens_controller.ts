import User from '#models/user'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import UserTransformer from '#transformers/user_transformer'

export default class AccessTokensController {
  /**
   * Log in: returns an access token and a refresh token
   */
  async store({ request, auth, serialize }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const user = await User.verifyCredentials(email, password)
    const tokens = await auth.use('jwt').generate(user)

    return serialize({
      user: UserTransformer.transform(user),
      ...tokens,
    })
  }

  /**
   * Exchange a refresh token for a new access token and refresh token.
   * The refresh token is read from the "refreshToken" body field.
   */
  async refresh({ auth, serialize }: HttpContext) {
    return serialize(await auth.use('jwt').generateWithRefreshToken())
  }

  /**
   * Log out: deletes the refresh token. The access token stays valid
   * until it expires, so the client must drop it too.
   */
  async destroy({ auth }: HttpContext) {
    await auth.use('jwt').revoke()

    return {
      message: 'Logged out successfully',
    }
  }
}
