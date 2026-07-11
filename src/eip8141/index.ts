// biome-ignore lint/performance/noBarrelFile: entrypoint module

export {
  type ToEoaFrameAccountParameters,
  type ToEoaFrameAccountReturnType,
  toEoaFrameAccount,
} from './accounts/toEoaFrameAccount.js'
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
  type PrepareFrameTransactionParameters,
  type PrepareFrameTransactionReturnType,
  prepareFrameTransaction,
} from './actions/prepareFrameTransaction.js'
// ── Actions ──────────────────────────────────────────────────────────────────
export {
  type SendFrameTransactionParameters,
  type SendFrameTransactionReturnType,
  sendFrameTransaction,
} from './actions/sendFrameTransaction.js'

// ── Chain Config ─────────────────────────────────────────────────────────────
export { chainConfig } from './chainConfig.js'

// ── Chains ───────────────────────────────────────────────────────────────────
export * from './chains.js'

// ── Constants ────────────────────────────────────────────────────────────────
export {
  ENTRY_POINT_ADDRESS,
  FRAME_TX_TYPE,
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
  serializeFrameTransaction,
  serializers,
  serializeTransaction,
} from './serializers.js'

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  FrameAccount,
  FrameCall,
  FramePaymaster,
} from './types/account.js'
export type {
  Frame,
  FrameMode as FrameModeType,
  FrameReceipt,
  FrameReceiptStatus,
  RpcFrame,
  RpcFrameReceipt,
} from './types/frame.js'
export type {
  Eip8141FrameTransaction,
  Eip8141RpcFrameTransaction,
  Eip8141RpcTransactionReceipt,
  Eip8141TransactionReceipt,
  Eip8141TransactionSerializable,
  Eip8141TransactionSerialized,
  RpcTxSignature,
  TransactionSerializableFrame,
  TransactionSerializedFrame,
  TxSignature,
} from './types/transaction.js'

// ── Utils ────────────────────────────────────────────────────────────────────
export { computeSigHash } from './utils/computeSigHash.js'
export {
  encodeEoaCalls,
  makeEoaSignaturePlaceholder,
  signEoaTransaction,
} from './utils/eoa.js'
export {
  frameExpiryVerifierAddress,
  frameFlagAtomicBatch,
  makeExpiryFrame,
  withAtomicBatch,
} from './utils/frames.js'
export {
  frameTransactionBaseGas,
  frameTransactionPerFrameGas,
  getFrameTransactionGas,
  p256SignatureGas,
  secp256k1SignatureGas,
} from './utils/gas.js'
export { isFrameTransaction } from './utils/isFrameTransaction.js'
