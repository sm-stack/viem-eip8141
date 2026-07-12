import { describe, expect, test } from 'vitest'
import { privateKeyToAccount } from '../../accounts/privateKeyToAccount.js'
import { toEoaFrameAccount } from '../accounts/toEoaFrameAccount.js'
import { toSimple8141Account } from '../accounts/toSimple8141Account.js'
import { signEoaTransaction } from '../utils/eoa.js'
import { prepareFrameTransaction } from './prepareFrameTransaction.js'

const owner = privateKeyToAccount(`0x${'01'.repeat(32)}`)
const common = {
  chainId: 1,
  nonce: 0,
  maxFeePerGas: 10n,
  maxPriorityFeePerGas: 1n,
} as const

describe('prepareFrameTransaction', () => {
  test('builds LocalAccount EOA frames with tx-level signatures', async () => {
    const transaction = await prepareFrameTransaction({} as never, {
      ...common,
      account: owner,
      calls: [
        {
          to: '0x2222222222222222222222222222222222222222',
          value: 123n,
          data: '0x1234',
        },
      ],
    })

    expect(transaction.frames).toMatchObject([
      { mode: 'verify', flags: 3, value: 0n, data: '0x' },
      {
        mode: 'sender',
        flags: 0,
        value: 123n,
        target: '0x2222222222222222222222222222222222222222',
      },
    ])
    expect(transaction.signatures).toHaveLength(1)
    expect(transaction.signatures[0]).toMatchObject({
      scheme: 0,
      signer: owner.address,
      msg: '0x',
    })
    expect(transaction).toMatchObject({ nonceKeys: [0n], nonceSeq: 0n })
  })

  test('loads the shared sequence for explicit keyed nonce domains', async () => {
    const request = async ({ method }: { method: string }) => {
      if (method === 'eth_getStorageAt') return '0x3'
      throw new Error(`unexpected method ${method}`)
    }
    const transaction = await prepareFrameTransaction({ request } as never, {
      account: owner,
      chainId: 1,
      nonceKeys: [7n, 11n],
      maxFeePerGas: 10n,
      maxPriorityFeePerGas: 1n,
      calls: [{ to: '0x2222222222222222222222222222222222222222' }],
    })
    expect(transaction).toMatchObject({
      nonceKeys: [7n, 11n],
      nonceSeq: 3n,
    })
  })

  test('encodes Simple8141Account validate(signatureIndex)', async () => {
    const account = toSimple8141Account({
      address: '0x3333333333333333333333333333333333333333',
      owner,
      scope: 2,
    })
    const transaction = await prepareFrameTransaction({} as never, {
      ...common,
      account,
      calls: [{ to: '0x2222222222222222222222222222222222222222' }],
    })

    expect(transaction.frames[0]).toMatchObject({
      mode: 'verify',
      flags: 2,
      value: 0n,
      data: `0xce4d01a3${'00'.repeat(32)}`,
    })
    expect(transaction.signatures[0]?.signer).toBe(owner.address)
  })

  test('supports explicit P256 transaction signatures', async () => {
    const account = toEoaFrameAccount({
      signatureType: 'p256',
      publicKey: { x: `0x${'11'.repeat(32)}`, y: `0x${'22'.repeat(32)}` },
      sign: async () => ({
        r: `0x${'33'.repeat(32)}`,
        s: `0x${'44'.repeat(32)}`,
      }),
    })
    const transaction = await prepareFrameTransaction({} as never, {
      ...common,
      account,
      calls: [{ to: '0x2222222222222222222222222222222222222222' }],
    })

    expect(transaction.signatures[0]).toMatchObject({ scheme: 1, msg: '0x' })
    expect(transaction.signatures[0]?.signature).toHaveLength(2 + 128 * 2)
  })

  test('signs account and paymaster placeholders over the same sigHash', async () => {
    const paymasterSigner = privateKeyToAccount(`0x${'02'.repeat(32)}`)
    const transaction = await prepareFrameTransaction({} as never, {
      ...common,
      account: owner,
      calls: [{ to: '0x2222222222222222222222222222222222222222' }],
      paymaster: {
        address: '0x3333333333333333333333333333333333333333',
        signFrameTransaction: async () => ({
          mode: 'verify',
          flags: 1,
          target: '0x3333333333333333333333333333333333333333',
          gasLimit: 40_000n,
          value: 0n,
          data: `0xce4d01a3${'0'.repeat(63)}1`,
        }),
        getTransactionSignaturePlaceholders: () => [
          {
            scheme: 0,
            signer: paymasterSigner.address,
            msg: '0x',
            signature: `0x${'00'.repeat(65)}`,
          },
        ],
        signTransactionSignatures: async ({ sigHash }) => [
          await signEoaTransaction(paymasterSigner, sigHash),
        ],
      },
    })

    expect(transaction.signatures.map(({ signer }) => signer)).toEqual([
      owner.address,
      paymasterSigner.address,
    ])
    expect(transaction.frames.map(({ flags }) => flags)).toEqual([2, 1, 0])
    expect(transaction.frames[0]?.gasLimit).toBe(40_000n)
  })
})
