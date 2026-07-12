import { describe, expect, test } from 'vitest'
import { getKeyedNonce } from './getKeyedNonce.js'

const sender = '0x1111111111111111111111111111111111111111'

describe('getKeyedNonce', () => {
  test('uses the account nonce for key zero', async () => {
    const requests: unknown[] = []
    const client = {
      request: async (request: unknown) => {
        requests.push(request)
        return '0x7'
      },
    }
    await expect(
      getKeyedNonce(client as never, { sender, key: 0n }),
    ).resolves.toBe(7n)
    expect(requests).toEqual([
      {
        method: 'eth_getTransactionCount',
        params: [sender, 'pending'],
      },
    ])
  })

  test('derives the nonce manager slot for a nonzero key', async () => {
    const requests: unknown[] = []
    const client = {
      request: async (request: unknown) => {
        requests.push(request)
        return '0x3'
      },
    }
    await expect(
      getKeyedNonce(client as never, { sender, key: 7n }),
    ).resolves.toBe(3n)
    expect(requests).toEqual([
      {
        method: 'eth_getStorageAt',
        params: [
          '0x0000000000000000000000000000000000008250',
          '0x07315875c131dc1dff59b5eecd3feba7c4eb34f9c8bac4a22e69acd1d04d63c5',
          'pending',
        ],
      },
    ])
  })
})
