import { InvalidAddressError } from '../errors/address.js'
import type { ChainSerializers } from '../types/chain.js'
import type { Hex, Signature } from '../types/misc.js'
import type { TransactionSerializable } from '../types/transaction.js'
import { isAddress } from '../utils/address/isAddress.js'
import { concatHex } from '../utils/data/concat.js'
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
 * Format: `0x06 || rlp([chainId, nonce, sender, frames, maxPriorityFeePerGas,
 *          maxFeePerGas, maxFeePerBlobGas, blobVersionedHashes])`
 *
 * Each frame is encoded as: `[mode, target, gasLimit, data]`
 */
export function serializeFrameTransaction(
  transaction: TransactionSerializableFrame,
): TransactionSerializedFrame {
  assertFrameTransaction(transaction)

  const {
    chainId,
    nonce,
    sender,
    frames,
    maxPriorityFeePerGas,
    maxFeePerGas,
    maxFeePerBlobGas,
    blobVersionedHashes,
  } = transaction

  // Encode each frame as [mode, target, gasLimit, data]
  const serializedFrames: Hex[][] = frames.map((frame) => [
    toMinimalHex(frameModeToNumber[frame.mode]),
    frame.target ?? '0x',
    toMinimalHex(frame.gasLimit),
    frame.data,
  ])

  const serializedTransaction: (Hex | Hex[] | Hex[][])[] = [
    toMinimalHex(chainId),
    toMinimalHex(nonce),
    sender,
    serializedFrames,
    toMinimalHex(maxPriorityFeePerGas ?? 0),
    toMinimalHex(maxFeePerGas ?? 0),
    toMinimalHex(maxFeePerBlobGas ?? 0),
    blobVersionedHashes ?? [],
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

function assertFrameTransaction(transaction: TransactionSerializableFrame) {
  const { sender, frames } = transaction
  if (!isAddress(sender))
    throw new InvalidAddressError({ address: sender })
  if (!frames || frames.length === 0)
    throw new Error('Frame transaction must have at least one frame.')
  if (frames.length > 1000)
    throw new Error('Frame transaction exceeds MAX_FRAMES (1000).')
  for (const frame of frames) {
    if (frame.target && !isAddress(frame.target))
      throw new InvalidAddressError({ address: frame.target })
  }
}
