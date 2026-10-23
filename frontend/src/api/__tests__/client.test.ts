import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiGet, apiPost, apiPut } from '../client'
import { fetchCall, mockFetch } from './mockFetch'

afterEach(() => vi.unstubAllGlobals())

describe('apiGet', () => {
  it('adds defined query params and skips undefined ones', async () => {
    const fetchMock = mockFetch({ ok: true })
    await apiGet('/api/x', { a: 1, b: undefined, c: 'two words' })
    expect(fetchCall(fetchMock).url).toBe('/api/x?a=1&c=two+words')
  })

  it('leaves the path alone without a query', async () => {
    const fetchMock = mockFetch({ ok: true })
    await apiGet('/api/x')
    expect(fetchCall(fetchMock).url).toBe('/api/x')
  })

  it('throws ApiError with the FastAPI detail', async () => {
    mockFetch({ detail: 'Professor not found' }, 404)
    const error = await apiGet('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Professor not found' })
  })

  it('keeps an object detail and uses a generic message', async () => {
    const detail = { message: 'Already signed up', existing_signup: { signup_id: 3 } }
    mockFetch({ detail }, 409)
    const error = await apiGet('/api/x').catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 409, detail, message: 'Request failed with status 409' })
  })

  it('falls back to the status text when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 500, statusText: 'Server Error' })))
    await expect(apiGet('/api/x')).rejects.toMatchObject({ status: 500, detail: 'Server Error' })
  })
})

describe('apiPost / apiPut', () => {
  it('sends a JSON body with the right method', async () => {
    const fetchMock = mockFetch({ ok: true })
    await apiPost('/api/x', { a: 1 })
    await apiPut('/api/y', { b: 2 }, { q: 3 })

    const post = fetchCall(fetchMock, 0)
    expect(post.url).toBe('/api/x')
    expect(post.init).toMatchObject({ method: 'POST', body: '{"a":1}' })
    expect(post.init.headers).toMatchObject({ 'Content-Type': 'application/json' })

    const put = fetchCall(fetchMock, 1)
    expect(put.url).toBe('/api/y?q=3')
    expect(put.init).toMatchObject({ method: 'PUT', body: '{"b":2}' })
  })

  it('sends no body when none is given', async () => {
    const fetchMock = mockFetch({ ok: true })
    await apiPost('/api/x')
    expect(fetchCall(fetchMock).init.body).toBeUndefined()
  })
})
