import type { Hex } from '../../types/misc.js'
import { keccak256 } from '../../utils/hash/keccak256.js'
import { serializeFrameTransactionForSigHash } from '../serializers.js'
import type { TransactionSerializableFrame } from '../types/transaction.js'

/**
 * Computes the canonical signature hash for an EIP-8141 frame transaction.
 *
 * Empty-message transaction signatures have their raw signature bytes elided.
 *
 * @returns `keccak256(0x06 || rlp(tx_with_verify_data_zeroed))`
 */
export function computeSigHash(transaction: TransactionSerializableFrame): Hex {
  const signatures = transaction.signatures.map((signature) => ({
    ...signature,
    signature: (signature.msg === '0x' ? '0x' : signature.signature) as Hex,
  }))

  return keccak256(
    serializeFrameTransactionForSigHash({
      ...transaction,
      signatures,
    }),
  )
}
