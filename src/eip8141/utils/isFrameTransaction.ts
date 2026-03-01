import type { Eip8141TransactionSerializable } from '../types/transaction.js'

export function isFrameTransaction(
  transaction: Eip8141TransactionSerializable,
): boolean {
  if (transaction.type === 'frame') return true
  if ('frames' in transaction && Array.isArray(transaction.frames)) return true
  return false
}
