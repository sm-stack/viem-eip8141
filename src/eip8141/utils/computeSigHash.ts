import type { Hex } from '../../types/misc.js'
import { keccak256 } from '../../utils/hash/keccak256.js'
import { serializeFrameTransaction } from '../serializers.js'
import type { TransactionSerializableFrame } from '../types/transaction.js'

/**
 * Computes the canonical signature hash for an EIP-8141 frame transaction.
 *
 * Per the EIP-8141 spec, VERIFY frame data is elided (replaced with empty
 * bytes) before hashing. This means the sigHash is independent of VERIFY
 * frame contents, resolving the chicken-and-egg problem: you can compute
 * the hash before filling in VERIFY data.
 *
 * @returns `keccak256(0x06 || rlp(tx_with_verify_data_zeroed))`
 */
export function computeSigHash(
  transaction: TransactionSerializableFrame,
): Hex {
  const sigHashFrames = transaction.frames.map((frame) => ({
    ...frame,
    data: (frame.mode === 'verify' ? '0x' : frame.data) as Hex,
  }))

  return keccak256(
    serializeFrameTransaction({
      ...transaction,
      frames: sigHashFrames,
    }),
  )
}
