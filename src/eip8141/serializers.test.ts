import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { privateKeyToAccount } from '../accounts/privateKeyToAccount.js'
import { parseTransaction } from './parsers.js'
import { serializeFrameTransaction } from './serializers.js'
import type { TransactionSerializableFrame } from './types/transaction.js'
import { computeSigHash } from './utils/computeSigHash.js'
import { makeEoaSignaturePlaceholder, signEoaTransaction } from './utils/eoa.js'
import { makeExpiryFrame, withAtomicBatch } from './utils/frames.js'
import { getFrameTransactionGas } from './utils/gas.js'

const workspaceVectorPath = fileURLToPath(
  new URL(
    '../../../.context/test-vectors/frame-transaction-v1.json',
    import.meta.url,
  ),
)
const vectorPath =
  process.env.EIP8141_VECTOR_PATH ??
  (existsSync(workspaceVectorPath)
    ? workspaceVectorPath
    : fileURLToPath(
        new URL('./testdata/frame-transaction-v1.json', import.meta.url),
      ))
const stored = JSON.parse(readFileSync(vectorPath, 'utf8'))
const transaction = {
  ...stored.transaction,
  chainId: Number(stored.transaction.chainId),
  nonceKeys: stored.transaction.nonceKeys.map(BigInt),
  nonceSeq: BigInt(stored.transaction.nonceSeq),
  frames: stored.transaction.frames.map((frame: any) => ({
    ...frame,
    gasLimit: BigInt(frame.gasLimit),
    value: BigInt(frame.value),
  })),
  maxPriorityFeePerGas: BigInt(stored.transaction.maxPriorityFeePerGas),
  maxFeePerGas: BigInt(stored.transaction.maxFeePerGas),
  maxFeePerBlobGas: BigInt(stored.transaction.maxFeePerBlobGas),
  recentRootReferences: stored.transaction.recentRootReferences.map(
    (reference: any) => ({ ...reference, slot: BigInt(reference.slot) }),
  ),
} as TransactionSerializableFrame
const rawTransaction = stored.rawTransaction

describe('EIP-8141 frame transaction', () => {
  test('matches the geth EIP-8272 raw transaction and sig hash vector', () => {
    expect(serializeFrameTransaction(transaction)).toBe(rawTransaction)
    expect(computeSigHash(transaction)).toBe(stored.sigHash)
  })

  test('round trips the 11-field transaction and 6-field frames', () => {
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
    expect(getFrameTransactionGas(transaction)).toBe(
      BigInt(stored.intrinsicGas),
    )
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

  test('rejects VERIFY frames in atomic batches', () => {
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        frames: [
          { ...transaction.frames[0]!, flags: 4 },
          transaction.frames[1]!,
        ],
      }),
    ).toThrow('VERIFY frame 0 has atomic batch flag')

    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        frames: [
          { ...transaction.frames[1]!, flags: 4 },
          transaction.frames[0]!,
        ],
      }),
    ).toThrow('atomic batch includes VERIFY frame 1')
  })

  test('rejects execution approval from a third-party target', () => {
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        frames: [
          {
            ...transaction.frames[0]!,
            flags: 2,
            target: '0x9999999999999999999999999999999999999999',
          },
        ],
      }),
    ).toThrow('execution approval outside sender')
  })

  test('round trips arbitrary signature witness bytes with an omitted signer', () => {
    const arbitrary = {
      ...transaction,
      signatures: [
        {
          scheme: 0 as const,
          signer: '0x0000000000000000000000000000000000000000',
          msg: '0x',
          signature: '0x0102030405',
        },
      ],
    }
    const parsed = parseTransaction(serializeFrameTransaction(arbitrary))
    expect(parsed.signatures).toEqual(arbitrary.signatures)
  })

  test('rejects invalid recent-root reference metadata', () => {
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        recentRootReferences: Array(17).fill(
          transaction.recentRootReferences[0]!,
        ),
      }),
    ).toThrow('MAX_RECENT_ROOT_REFS')
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        recentRootReferences: [
          { ...transaction.recentRootReferences[0]!, sourceId: '0x1234' },
        ],
      }),
    ).toThrow('sourceId must be 32 bytes')
    expect(() =>
      serializeFrameTransaction({
        ...transaction,
        recentRootReferences: [
          { ...transaction.recentRootReferences[0]!, slot: 1n << 64n },
        ],
      }),
    ).toThrow('slot does not fit uint64')
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
