import { createHmac, randomBytes } from 'node:crypto'
import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'

const credentials = { email: 'jane@example.com', password: 'secret-password' }

function createUser() {
  return User.create({ fullName: 'Jane Doe', ...credentials })
}

/**
 * Decodes the payload of a JWT, without verifying it
 */
function decodePayload(token: string) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
}

/**
 * Signs a JWT with a random key: a valid token, but not signed by the app
 */
function forgeToken(payload: Record<string, unknown>) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`
  const signature = createHmac('sha256', randomBytes(32)).update(unsigned).digest('base64url')
  return `${unsigned}.${signature}`
}

test.group('Auth | signup', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('create an account and return tokens', async ({ client, assert }) => {
    const response = await client.post('/api/v1/auth/signup').json({
      fullName: 'Jane Doe',
      ...credentials,
      passwordConfirmation: credentials.password,
    })

    response.assertStatus(200)
    const body = response.body().data
    assert.equal(body.user.email, credentials.email)
    assert.notProperty(body.user, 'password')
    assert.equal(body.type, 'bearer')
    assert.equal(body.expiresIn, '15m')
    assert.isString(body.token)
    assert.match(body.refreshToken, /^rt_/)
  })

  test('reject an email already in use', async ({ client }) => {
    await createUser()

    const response = await client.post('/api/v1/auth/signup').json({
      fullName: null,
      ...credentials,
      passwordConfirmation: credentials.password,
    })

    response.assertStatus(422)
  })
})

test.group('Auth | login', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('return an access token and a refresh token', async ({ client, assert }) => {
    const user = await createUser()

    const response = await client.post('/api/v1/auth/login').json(credentials)

    response.assertStatus(200)
    const { token, refreshToken } = response.body().data
    assert.match(refreshToken, /^rt_/)

    const payload = decodePayload(token)
    assert.equal(payload.userId, user.id)
    assert.equal(payload.exp - payload.iat, 15 * 60)
  })

  test('reject a wrong password', async ({ client }) => {
    await createUser()

    const response = await client
      .post('/api/v1/auth/login')
      .json({ ...credentials, password: 'wrong-password' })

    response.assertStatus(400)
  })
})

test.group('Auth | protected routes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('return the profile with a valid token', async ({ client, assert }) => {
    await createUser()
    const login = await client.post('/api/v1/auth/login').json(credentials)

    const response = await client
      .get('/api/v1/account/profile')
      .bearerToken(login.body().data.token)

    response.assertStatus(200)
    assert.equal(response.body().data.email, credentials.email)
  })

  test('loginAs works in tests', async ({ client, assert }) => {
    const user = await createUser()

    const response = await client.get('/api/v1/account/profile').loginAs(user)

    response.assertStatus(200)
    assert.equal(response.body().data.id, user.id)
  })

  test('reject a request without token', async ({ client }) => {
    const response = await client.get('/api/v1/account/profile')

    response.assertStatus(401)
  })

  test('reject a token signed with another key', async ({ client }) => {
    const user = await createUser()
    const now = Math.floor(Date.now() / 1000)

    const response = await client
      .get('/api/v1/account/profile')
      .bearerToken(forgeToken({ userId: user.id, iat: now, exp: now + 60 }))

    response.assertStatus(401)
  })

  test('reject a token whose payload was modified', async ({ client }) => {
    await createUser()
    const other = await User.create({ email: 'john@example.com', password: 'secret-password' })
    const login = await client.post('/api/v1/auth/login').json(credentials)

    const [header, , signature] = login.body().data.token.split('.')
    const tampered = Buffer.from(
      JSON.stringify({ ...decodePayload(login.body().data.token), userId: other.id })
    ).toString('base64url')

    const response = await client
      .get('/api/v1/account/profile')
      .bearerToken(`${header}.${tampered}.${signature}`)

    response.assertStatus(401)
  })

  test('reject a refresh token used as access token', async ({ client }) => {
    await createUser()
    const login = await client.post('/api/v1/auth/login').json(credentials)

    const response = await client
      .get('/api/v1/account/profile')
      .bearerToken(login.body().data.refreshToken)

    response.assertStatus(401)
  })
})

test.group('Auth | refresh', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('exchange a refresh token for a new pair', async ({ client, assert }) => {
    await createUser()
    const login = await client.post('/api/v1/auth/login').json(credentials)

    const response = await client
      .post('/api/v1/auth/refresh')
      .json({ refreshToken: login.body().data.refreshToken })

    response.assertStatus(200)
    const { token, refreshToken } = response.body().data
    assert.notEqual(refreshToken, login.body().data.refreshToken)

    const profile = await client.get('/api/v1/account/profile').bearerToken(token)
    profile.assertStatus(200)
  })

  test('a refresh token can only be used once', async ({ client }) => {
    await createUser()
    const login = await client.post('/api/v1/auth/login').json(credentials)
    const { refreshToken } = login.body().data

    const first = await client.post('/api/v1/auth/refresh').json({ refreshToken })
    first.assertStatus(200)

    const second = await client.post('/api/v1/auth/refresh').json({ refreshToken })
    second.assertStatus(401)
  })

  test('reject a request without refresh token', async ({ client }) => {
    const response = await client.post('/api/v1/auth/refresh')

    response.assertStatus(401)
  })

  test('reject an access token used as refresh token', async ({ client }) => {
    await createUser()
    const login = await client.post('/api/v1/auth/login').json(credentials)

    const response = await client
      .post('/api/v1/auth/refresh')
      .json({ refreshToken: login.body().data.token })

    response.assertStatus(401)
  })
})

test.group('Auth | logout', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('revoke the refresh token', async ({ client, assert }) => {
    const user = await createUser()
    const login = await client.post('/api/v1/auth/login').json(credentials)
    const { refreshToken } = login.body().data

    const response = await client.post('/api/v1/auth/logout').json({ refreshToken })
    response.assertStatus(200)

    const tokens = await db.from('jwt_refresh_tokens').where('tokenable_id', user.id)
    assert.lengthOf(tokens, 0)

    const refresh = await client.post('/api/v1/auth/refresh').json({ refreshToken })
    refresh.assertStatus(401)
  })
})
