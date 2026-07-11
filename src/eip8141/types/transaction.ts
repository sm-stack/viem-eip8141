import type { Address } from 'abitype'
import type { Hex } from '../../types/misc.js'
import type {
  Index,
  Quantity,
  RpcTransaction as RpcTransaction_,
  RpcTransactionReceipt,
} from '../../types/rpc.js'
import type {
  Transaction as Transaction_,
  TransactionBase,
  TransactionReceipt,
  TransactionSerializable,
  TransactionSerialized,
  TransactionType,
} from '../../types/transaction.js'
import type { OneOf } from '../../types/utils.js'
import type { Frame, FrameReceipt, RpcFrame, RpcFrameReceipt } from './frame.js'

export type TxSignature = {
  scheme: 0 | 1
  signer: Address
  msg: Hex
  signature: Hex
}

export type RpcTxSignature = {
  scheme: Hex
  signer: Address
  msg: Hex
  signature: Hex
}

// ---------------------------------------------------------------------------
// Transaction Type
// ---------------------------------------------------------------------------

export type Eip8141TransactionType = TransactionType | 'frame'

// ---------------------------------------------------------------------------
// Serializable (what the user builds / serializer accepts)
// ---------------------------------------------------------------------------

export type TransactionSerializableFrame = {
  chainId: number
  nonce: number
  sender: Address
  frames: Frame[]
  signatures: TxSignature[]
  maxPriorityFeePerGas?: bigint | undefined
  maxFeePerGas?: bigint | undefined
  maxFeePerBlobGas?: bigint | undefined
  blobVersionedHashes?: Hex[] | undefined
  type: 'frame'
}

export type Eip8141TransactionSerializable = OneOf<
  TransactionSerializableFrame | TransactionSerializable
>

// ---------------------------------------------------------------------------
// Serialized (raw bytes output)
// ---------------------------------------------------------------------------

export type TransactionSerializedFrame = `0x06${string}`

export type Eip8141TransactionSerialized =
  | TransactionSerializedFrame
  | TransactionSerialized

// ---------------------------------------------------------------------------
// RPC types (hex-encoded, from JSON-RPC responses)
// ---------------------------------------------------------------------------

type RpcTransaction<pending extends boolean = boolean> =
  RpcTransaction_<pending> & {
    sender?: undefined
    frames?: undefined
    signatures?: undefined
  }

export type Eip8141RpcFrameTransaction<pending extends boolean = boolean> =
  Omit<TransactionBase<Quantity, Index, pending>, 'typeHex'> & {
    sender: Address
    frames: RpcFrame[]
    signatures: RpcTxSignature[]
    maxPriorityFeePerGas: Hex
    maxFeePerGas: Hex
    maxFeePerBlobGas?: Hex | undefined
    blobVersionedHashes?: Hex[] | undefined
    type: '0x06'
  }

export type Eip8141RpcTransaction<pending extends boolean = boolean> = OneOf<
  RpcTransaction<pending> | Eip8141RpcFrameTransaction<pending>
>

// ---------------------------------------------------------------------------
// Formatted transaction (user-facing, decoded from RPC)
// ---------------------------------------------------------------------------

type Transaction<pending extends boolean = boolean> = Transaction_<
  bigint,
  number,
  pending
> & {
  sender?: undefined
  frames?: undefined
  signatures?: undefined
}

export type Eip8141FrameTransaction<pending extends boolean = boolean> =
  TransactionBase<bigint, number, pending> & {
    sender: Address
    frames: Frame[]
    signatures: TxSignature[]
    maxPriorityFeePerGas: bigint
    maxFeePerGas: bigint
    maxFeePerBlobGas?: bigint | undefined
    blobVersionedHashes?: Hex[] | undefined
    type: 'frame'
  }

export type Eip8141Transaction<pending extends boolean = boolean> = OneOf<
  Transaction<pending> | Eip8141FrameTransaction<pending>
>

// ---------------------------------------------------------------------------
// Receipt
// ---------------------------------------------------------------------------

export type Eip8141TransactionReceiptOverrides = {
  /** Address that paid gas fees (may differ from sender with paymaster). */
  payer: Address
  /** Per-frame execution receipts. */
  frameReceipts: FrameReceipt[]
}

export type Eip8141RpcTransactionReceiptOverrides = {
  payer: Address
  frameReceipts: RpcFrameReceipt[]
}

export type Eip8141TransactionReceipt = TransactionReceipt &
  Eip8141TransactionReceiptOverrides

export type Eip8141RpcTransactionReceipt = RpcTransactionReceipt &
  Eip8141RpcTransactionReceiptOverrides
