import { InvalidAddressError } from '../errors/address.js'
import type { ChainSerializers } from '../types/chain.js'
import type { Hex, Signature } from '../types/misc.js'
import type { TransactionSerializable } from '../types/transaction.js'
import { isAddress } from '../utils/address/isAddress.js'
import { concatHex } from '../utils/data/concat.js'
import { isHex } from '../utils/data/isHex.js'
import { toHex } from '../utils/encoding/toHex.js'
import { toRlp } from '../utils/encoding/toRlp.js'
import { serializeTransaction as serializeTransaction_ } from '../utils/transaction/serializeTransaction.js'
import { frameModeToNumber } from './types/frame.js'
import type {
  Eip8141TransactionSerializable,
  TransactionSerializableFrame,
  TransactionSerializedFrame,
} from './types/transaction.js'
import { isFrameTransaction } from './utils/isFrameTransaction.js'

const expiryVerifierAddress = '0x0000000000000000000000000000000000008141'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function serializeTransaction(
  transaction: Eip8141TransactionSerializable,
  signature?: Signature,
) {
  if (isFrameTransaction(transaction))
    return serializeFrameTransaction(
      transaction as TransactionSerializableFrame,
    )
  return serializeTransaction_(
    transaction as TransactionSerializable,
    signature,
  )
}

export const serializers = {
  transaction: serializeTransaction,
} as const satisfies ChainSerializers

// ---------------------------------------------------------------------------
// Frame Transaction Serializer
// ---------------------------------------------------------------------------

/**
 * Serializes an EIP-8141 frame transaction to its RLP-encoded form.
 *
 * Format: `0x06 || rlp([chainId, nonceKeys, nonceSeq, sender, frames, signatures, maxPriorityFeePerGas,
 *          maxFeePerGas, maxFeePerBlobGas, blobVersionedHashes, recentRootReferences])`
 *
 * Each frame is encoded as: `[mode, flags, target, gasLimit, value, data]`
 */
export function serializeFrameTransaction(
  transaction: TransactionSerializableFrame,
): TransactionSerializedFrame {
  assertFrameTransaction(transaction, {})
  return encodeFrameTransaction(transaction)
}

/** @internal Used only to encode the canonical empty-message sig-hash payload. */
export function serializeFrameTransactionForSigHash(
  transaction: TransactionSerializableFrame,
): TransactionSerializedFrame {
  assertFrameTransaction(transaction, { allowEmptySignatures: true })
  return encodeFrameTransaction(transaction)
}

function encodeFrameTransaction(
  transaction: TransactionSerializableFrame,
): TransactionSerializedFrame {
  const {
    chainId,
    sender,
    frames,
    signatures,
    maxPriorityFeePerGas,
    maxFeePerGas,
    maxFeePerBlobGas,
    blobVersionedHashes,
    recentRootReferences,
  } = transaction
  const { nonceKeys, nonceSeq } = normalizeNonce(transaction)

  const serializedFrames: Hex[][] = frames.map((frame) => [
    toMinimalHex(frameModeToNumber[frame.mode]),
    toMinimalHex(frame.flags ?? 0),
    frame.target ?? '0x',
    toMinimalHex(frame.gasLimit),
    toMinimalHex(frame.value ?? 0n),
    frame.data,
  ])

  const serializedSignatures: Hex[][] = signatures.map((signature) => [
    toMinimalHex(signature.scheme),
    signature.signer,
    signature.msg,
    signature.signature,
  ])
  const serializedRecentRootReferences: Hex[][] = recentRootReferences.map(
    (reference) => [
      reference.sourceId,
      toMinimalHex(reference.slot),
      reference.root,
    ],
  )

  const serializedTransaction: (Hex | Hex[] | Hex[][])[] = [
    toMinimalHex(chainId),
    nonceKeys.map(toMinimalHex),
    toMinimalHex(nonceSeq),
    sender,
    serializedFrames,
    serializedSignatures,
    toMinimalHex(maxPriorityFeePerGas ?? 0),
    toMinimalHex(maxFeePerGas ?? 0),
    toMinimalHex(maxFeePerBlobGas ?? 0),
    blobVersionedHashes ?? [],
    serializedRecentRootReferences,
  ]

  return concatHex([
    '0x06',
    toRlp(serializedTransaction),
  ]) as TransactionSerializedFrame
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** RLP-canonical integer encoding: 0 → '0x' (empty bytes), nonzero → toHex. */
function toMinimalHex(value: number | bigint): Hex {
  if (value === 0 || value === 0n) return '0x'
  return toHex(value)
}

function assertFrameTransaction(
  transaction: TransactionSerializableFrame,
  options: { allowEmptySignatures?: boolean },
) {
  const { sender, frames, signatures, recentRootReferences } = transaction
  normalizeNonce(transaction)
  if (!isAddress(sender)) throw new InvalidAddressError({ address: sender })
  if (!frames || frames.length === 0)
    throw new Error('Frame transaction must have at least one frame.')
  if (frames.length > 64)
    throw new Error('Frame transaction exceeds MAX_FRAMES (64).')
  let expiryFrames = 0
  for (const [index, frame] of frames.entries()) {
    if (frame.target && !isAddress(frame.target))
      throw new InvalidAddressError({ address: frame.target })
    const flags = frame.flags ?? 0
    const value = frame.value ?? 0n
    if (!Number.isInteger(flags) || flags < 0 || flags >= 8)
      throw new Error(`Frame ${index} has invalid flags ${frame.flags}.`)
    if (frame.mode !== 'sender' && value !== 0n)
      throw new Error(`Frame ${index} has nonzero value outside SENDER mode.`)
    if ((flags & 4) !== 0 && index === frames.length - 1)
      throw new Error(
        `Frame ${index} has atomic batch flag without a following frame.`,
      )
    if (frame.gasLimit < 0n || frame.gasLimit > 0xffff_ffff_ffff_ffffn)
      throw new Error(`Frame ${index} gasLimit does not fit uint64.`)
    if (value < 0n || value > (1n << 256n) - 1n)
      throw new Error(`Frame ${index} value does not fit uint256.`)
    const resolvedTarget = (frame.target ?? sender).toLowerCase()
    if (frame.mode === 'verify' && resolvedTarget === expiryVerifierAddress) {
      expiryFrames++
      if (expiryFrames > 1)
        throw new Error(
          'Frame transaction has multiple expiry verifier frames.',
        )
      if (flags !== 0 || value !== 0n || frame.data.length !== 18)
        throw new Error(
          `Frame ${index} has an invalid expiry verifier payload.`,
        )
    }
  }
  for (const [index, signature] of signatures.entries()) {
    if (!isAddress(signature.signer))
      throw new InvalidAddressError({ address: signature.signer })
    const expectedLength = signature.scheme === 0 ? 65 : 128
    if (signature.scheme !== 0 && signature.scheme !== 1)
      throw new Error(`Signature ${index} has unsupported scheme.`)
    if (
      !(options.allowEmptySignatures && signature.signature === '0x') &&
      (signature.signature.length - 2) / 2 !== expectedLength
    )
      throw new Error(`Signature ${index} has invalid length.`)
    const messageLength = (signature.msg.length - 2) / 2
    if (messageLength !== 0 && messageLength !== 32)
      throw new Error(`Signature ${index} message has invalid length.`)
    if (messageLength === 32 && /^0x0+$/.test(signature.msg))
      throw new Error(`Signature ${index} has an explicit zero message.`)
  }
  if (recentRootReferences.length > 16)
    throw new Error('Frame transaction exceeds MAX_RECENT_ROOT_REFS (16).')
  for (const [index, reference] of recentRootReferences.entries()) {
    if (!isHex(reference.sourceId) || reference.sourceId.length !== 66)
      throw new Error(
        `Recent root reference ${index} sourceId must be 32 bytes.`,
      )
    if (!isHex(reference.root) || reference.root.length !== 66)
      throw new Error(`Recent root reference ${index} root must be 32 bytes.`)
    if (reference.slot < 0n || reference.slot > 0xffff_ffff_ffff_ffffn)
      throw new Error(
        `Recent root reference ${index} slot does not fit uint64.`,
      )
  }
}

function normalizeNonce(transaction: TransactionSerializableFrame): {
  nonceKeys: bigint[]
  nonceSeq: bigint
} {
  const hasLegacy = transaction.nonce !== undefined
  const hasKeyed =
    transaction.nonceKeys !== undefined || transaction.nonceSeq !== undefined
  if (hasLegacy === hasKeyed)
    throw new Error(
      'Frame transaction must specify either nonce or nonceKeys with nonceSeq.',
    )
  const nonceKeys = hasLegacy ? [0n] : transaction.nonceKeys
  const nonceSeq = hasLegacy ? BigInt(transaction.nonce) : transaction.nonceSeq
  if (!nonceKeys || nonceSeq === undefined)
    throw new Error('Frame transaction nonceKeys requires nonceSeq.')
  if (nonceKeys.length < 1 || nonceKeys.length > 16)
    throw new Error(
      'Frame transaction nonceKeys length must be between 1 and 16.',
    )
  if (nonceSeq < 0n || nonceSeq > 0xffff_ffff_ffff_ffffn)
    throw new Error('Frame transaction nonceSeq does not fit uint64.')
  for (const [index, key] of nonceKeys.entries()) {
    if (key < 0n || key >= 1n << 256n)
      throw new Error(
        `Frame transaction nonce key ${index} does not fit uint256.`,
      )
    if (index > 0 && nonceKeys[index - 1]! >= key)
      throw new Error(
        'Frame transaction nonceKeys must be strictly increasing.',
      )
    if (key === 0n && nonceKeys.length !== 1)
      throw new Error('Zero nonce key is only valid as singleton [0].')
  }
  if (hasLegacy) {
    if (!Number.isSafeInteger(transaction.nonce) || transaction.nonce < 0)
      throw new Error(
        'Frame transaction nonce must be a non-negative safe integer.',
      )
  }
  return { nonceKeys: [...nonceKeys], nonceSeq }
}
