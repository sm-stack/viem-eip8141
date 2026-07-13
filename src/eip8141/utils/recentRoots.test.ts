import { describe, expect, test, vi } from 'vitest'
import { RECENT_ROOT_ADDRESS } from '../constants.js'
import {
  computeSourceId,
  makeRootReference,
  writeRecentRoot,
} from './recentRoots.js'

describe('EIP-8272 recent root helpers', () => {
  const address = '0x1111111111111111111111111111111111111111'
  const salt = `0x${'22'.repeat(32)}` as const
  const root = `0x${'33'.repeat(32)}` as const

  test('computes source IDs from the packed address and salt', () => {
    expect(computeSourceId(address, salt)).toBe(
      '0x2bc0e4453d022b3e9e099d968a3291ad16b616abdb07af6b9d3b771b8b35da13',
    )
  })

  test('builds and validates references', () => {
    const reference = makeRootReference({
      sourceId: `0x${'44'.repeat(32)}`,
      slot: 12n,
      root,
    })
    expect(reference.slot).toBe(12n)
    expect(() => makeRootReference({ ...reference, slot: 1n << 64n })).toThrow(
      'uint64',
    )
  })

  test('writes salt || root to the native system contract', async () => {
    const request = vi.fn().mockResolvedValue(`0x${'55'.repeat(32)}`)
    const client = { account: address, chain: undefined, request }
    await writeRecentRoot(client as never, { salt, root })
    expect(request.mock.calls[0]?.[0]).toEqual({
      method: 'eth_sendTransaction',
      params: [
        expect.objectContaining({
          data: `${salt}${root.slice(2)}`,
          from: address,
          to: RECENT_ROOT_ADDRESS,
          value: '0x0',
        }),
      ],
    })
  })
})
