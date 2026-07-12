import { describe, expect, test } from 'vitest'
import { privateKeyToAccount } from '../accounts/privateKeyToAccount.js'
import { parseTransaction } from './parsers.js'
import { serializeFrameTransaction } from './serializers.js'
import type { TransactionSerializableFrame } from './types/transaction.js'
import { computeSigHash } from './utils/computeSigHash.js'
import { makeEoaSignaturePlaceholder, signEoaTransaction } from './utils/eoa.js'
import { makeExpiryFrame, withAtomicBatch } from './utils/frames.js'
import { getFrameTransactionGas } from './utils/gas.js'

const transaction: TransactionSerializableFrame = {
  chainId: 1,
  nonceKeys: [0n],
  nonceSeq: 7n,
  sender: '0x1111111111111111111111111111111111111111',
  frames: [
    {
      mode: 'verify',
      flags: 3,
      target: null,
      gasLimit: 50_000n,
      value: 0n,
      data: '0xaabb',
    },
    {
      mode: 'sender',
      flags: 4,
      target: '0x2222222222222222222222222222222222222222',
      gasLimit: 70_000n,
      value: 12_345n,
      data: '0xccddee',
    },
    {
      mode: 'default',
      flags: 0,
      target: '0x2222222222222222222222222222222222222222',
      gasLimit: 30_000n,
      value: 0n,
      data: '0x99',
    },
  ],
  signatures: [
    {
      scheme: 0,
      signer: '0x3333333333333333333333333333333333333333',
      msg: '0x',
      signature: `0x00${'11'.repeat(32)}${'22'.repeat(32)}`,
    },
    {
      scheme: 1,
      signer: '0x4444444444444444444444444444444444444444',
      msg: `0x${'aa'.repeat(32)}`,
      signature: `0x${'bb'.repeat(32)}${'cc'.repeat(32)}${'dd'.repeat(32)}${'ee'.repeat(32)}`,
    },
  ],
  maxPriorityFeePerGas: 3n,
  maxFeePerGas: 100n,
  maxFeePerBlobGas: 0n,
  blobVersionedHashes: [
    '0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
  ],
  type: 'frame',
}

const rawTransaction =
  '0x06f901a601c18007941111111111111111111111111111111111111111f84cca01038082c3508082aabbe202049422222222222222222222222222222222222222228301117082303983ccddeedd8080942222222222222222222222222222222222222222827530808199f90117f85a8094333333333333333333333333333333333333333380b8410011111111111111111111111111111111111111111111111111111111111111112222222222222222222222222222222222222222222222222222222222222222f8b901944444444444444444444444444444444444444444a0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab880bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee036480e1a00102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20'

describe('EIP-8141 frame transaction', () => {
  test('matches the geth EIP-8250 raw transaction and sig hash vector', () => {
    expect(serializeFrameTransaction(transaction)).toBe(rawTransaction)
    expect(computeSigHash(transaction)).toBe(
      '0x0b5ac8a9045a91da5db381e495a28164a69ca61b07098a5aabd630a891b4d93a',
    )
  })

  test('round trips the 10-field transaction and 6-field frames', () => {
    expect(parseTransaction(rawTransaction)).toEqual({
      ...transaction,
      maxFeePerBlobGas: undefined,
    })
  })

  test('promotes the legacy nonce alias to singleton key zero', () => {
    const { nonceKeys: _, nonceSeq: __, ...base } = transaction
    expect(serializeFrameTransaction({ ...base, nonce: 7 })).toBe(
      rawTransaction,
    )
  })

  test('charges the canonical fixed, calldata, signature, and frame gas', () => {
    expect(getFrameTransactionGas(transaction)).toBe(190_295n)
  })

  test('builds canonical expiry and atomic batch frames', () => {
    const expiry = makeExpiryFrame(0x0102_0304_0506_0708n, 50_000n)
    expect(expiry.data).toBe('0x0102030405060708')
    const batch = withAtomicBatch([
      transaction.frames[1]!,
      transaction.frames[2]!,
    ])
    expect(batch.map((frame) => frame.flags)).toEqual([4, 0])
  })

  test('encodes secp256k1 signatures as v|r|s with raw parity', async () => {
    const account = privateKeyToAccount(`0x${'01'.repeat(32)}`)
    const placeholder = makeEoaSignaturePlaceholder(account.address)
    const signature = await signEoaTransaction(
      account,
      computeSigHash({
        ...transaction,
        signatures: [placeholder],
      }),
    )
    expect(signature.signature).toHaveLength(2 + 65 * 2)
    expect(['00', '01']).toContain(signature.signature.slice(2, 4))
    expect(signature.signer).toBe(account.address)
    expect(signature.msg).toBe('0x')
  })

  test('rejects the legacy 8-field transaction schema', () => {
    expect(() =>
      parseTransaction(
        '0x06e80180941111111111111111111111111111111111111111c0808080c0',
      ),
    ).toThrow()
  })

  test('rejects invalid keyed nonce domains', () => {
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        nonceKeys: [2n, 1n],
      }),
    ).toThrow('strictly increasing')
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        nonceKeys: [0n, 1n],
      }),
    ).toThrow('singleton')
    expect(() =>
      parseTransaction(
        '0x06f901a40107941111111111111111111111111111111111111111f84cca01038082c3508082aabbe202049422222222222222222222222222222222222222228301117082303983ccddeedd8080942222222222222222222222222222222222222222827530808199f90117f85a8094333333333333333333333333333333333333333380b8410011111111111111111111111111111111111111111111111111111111111111112222222222222222222222222222222222222222222222222222222222222222f8b901944444444444444444444444444444444444444444a0aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab880bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee036480e1a00102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
      ),
    ).toThrow()
  })

  test('rejects invalid flags, value, and signature metadata', () => {
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        frames: [{ ...transaction.frames[0]!, flags: 8 }],
      }),
    ).toThrow('invalid flags')
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        frames: [{ ...transaction.frames[0]!, value: 1n }],
      }),
    ).toThrow('outside SENDER')
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        signatures: [
          { ...transaction.signatures[0]!, msg: `0x${'00'.repeat(32)}` },
        ],
      }),
    ).toThrow('explicit zero')
  })

  test('round trips canonical zero frame integers', () => {
    const zeroGas = {
      ...transaction,
      frames: [
        {
          mode: 'default' as const,
          flags: 0,
          target: transaction.frames[2]!.target,
          gasLimit: 0n,
          value: 0n,
          data: '0x' as const,
        },
      ],
      signatures: [],
    }
    expect(parseTransaction(serializeFrameTransaction(zeroGas))).toEqual({
      ...zeroGas,
      maxFeePerBlobGas: undefined,
    })
  })
})
