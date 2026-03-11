// biome-ignore lint/performance/noBarrelFile: entrypoint module

// ── Accounts ─────────────────────────────────────────────────────────────────
export {
  type ToFrameAccountParameters,
  type ToFrameAccountReturnType,
  toFrameAccount,
} from './accounts/toFrameAccount.js'
export {
  type ToSimple8141AccountParameters,
  type ToSimple8141AccountReturnType,
  toSimple8141Account,
} from './accounts/toSimple8141Account.js'
export {
  type ToEoaFrameAccountParameters,
  type ToEoaFrameAccountReturnType,
  toEoaFrameAccount,
} from './accounts/toEoaFrameAccount.js'

// ── Actions ──────────────────────────────────────────────────────────────────
export {
  type SendFrameTransactionParameters,
  type SendFrameTransactionReturnType,
  sendFrameTransaction,
} from './actions/sendFrameTransaction.js'
export {
  type PrepareFrameTransactionParameters,
  type PrepareFrameTransactionReturnType,
  prepareFrameTransaction,
} from './actions/prepareFrameTransaction.js'

// ── Chain Config ─────────────────────────────────────────────────────────────
export { chainConfig } from './chainConfig.js'

// ── Chains ───────────────────────────────────────────────────────────────────
export * from './chains.js'

// ── Constants ────────────────────────────────────────────────────────────────
export {
  FRAME_TX_TYPE,
  ENTRY_POINT_ADDRESS,
  FrameMode,
} from './constants.js'

// ── Decorators ───────────────────────────────────────────────────────────────
export {
  type FrameActions,
  frameActions,
} from './decorators/frame.js'

// ── Parsers ──────────────────────────────────────────────────────────────────
export {
  type ParseTransactionReturnType,
  parseTransaction,
} from './parsers.js'

// ── Serializers ──────────────────────────────────────────────────────────────
export {
  serializers,
  serializeTransaction,
  serializeFrameTransaction,
} from './serializers.js'

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  FrameAccount,
  FramePaymaster,
  FrameCall,
} from './types/account.js'
export type {
  Frame,
  FrameMode as FrameModeType,
  RpcFrame,
  FrameReceipt,
  RpcFrameReceipt,
} from './types/frame.js'
export type {
  TransactionSerializableFrame,
  TransactionSerializedFrame,
  Eip8141TransactionSerializable,
  Eip8141TransactionSerialized,
  Eip8141RpcFrameTransaction,
  Eip8141FrameTransaction,
  Eip8141TransactionReceipt,
  Eip8141RpcTransactionReceipt,
} from './types/transaction.js'

// ── Utils ────────────────────────────────────────────────────────────────────
export { computeSigHash } from './utils/computeSigHash.js'
export { encodeEoaCalls, signEoaVerify } from './utils/eoa.js'
export { isFrameTransaction } from './utils/isFrameTransaction.js'
