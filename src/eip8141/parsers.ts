import type { Address } from 'abitype'
import { InvalidSerializedTransactionError } from '../errors/transaction.js'
import type { Hex } from '../types/misc.js'
import { isHex } from '../utils/data/isHex.js'
import { sliceHex } from '../utils/data/slice.js'
import { hexToBigInt, hexToNumber } from '../utils/encoding/fromHex.js'
import { fromRlp } from '../utils/encoding/fromRlp.js'
import {
  type ParseTransactionReturnType as ParseTransactionReturnType_,
  parseTransaction as parseTransaction_,
} from '../utils/transaction/parseTransaction.js'
import { serializeFrameTransaction } from './serializers.js'
import type { Frame } from './types/frame.js'
import { numberToFrameMode } from './types/frame.js'
import type {
  Eip8141TransactionSerialized,
  TransactionSerializableFrame,
  TransactionSerializedFrame,
} from './types/transaction.js'

export type ParseTransactionReturnType<
  serialized extends Eip8141TransactionSerialized,
> = serialized extends TransactionSerializedFrame
  ? TransactionSerializableFrame
  : ParseTransactionReturnType_

export function parseTransaction<
  serialized extends Eip8141TransactionSerialized,
>(serializedTransaction: serialized): ParseTransactionReturnType<serialized> {
  const serializedType = sliceHex(serializedTransaction, 0, 1)

  if (serializedType === '0x06')
    return parseFrameTransaction(
      serializedTransaction as TransactionSerializedFrame,
    ) as ParseTransactionReturnType<serialized>

  return parseTransaction_(
    serializedTransaction,
  ) as ParseTransactionReturnType<serialized>
}

function parseFrameTransaction(
  serializedTransaction: TransactionSerializedFrame,
): TransactionSerializableFrame {
  // Strip the 0x06 prefix byte (2 hex chars) and the 0x prefix
  const payload = `0x${serializedTransaction.slice(4)}` as Hex
  const transactionArray = fromRlp(payload, 'hex')

  if (!Array.isArray(transactionArray) || transactionArray.length !== 9)
    throw new InvalidSerializedTransactionError({
      attributes: {},
      serializedTransaction,
      type: 'frame',
    })

  const [
    chainId,
    rawNonceKeys,
    nonceSeq,
    sender,
    rawFrames,
    rawSignatures,
    rawFees,
    blobVersionedHashes,
    rawRecentRootReferences,
  ] = transactionArray as [
    Hex,
    Hex[],
    Hex,
    Hex,
    (Hex | Hex[])[][],
    Hex[][],
    Hex[],
    Hex[],
    Hex[][],
  ]

  if (!Array.isArray(rawFees) || rawFees.length !== 3)
    throw new InvalidSerializedTransactionError({
      attributes: {},
      serializedTransaction,
      type: 'frame',
    })
  const [maxPriorityFeePerGas, maxFeePerGas, maxFeePerBlobGas] = rawFees as [
    Hex,
    Hex,
    Hex,
  ]

  // Parse frames
  const frames: Frame[] = rawFrames.map((rawFrame) => {
    if (!Array.isArray(rawFrame) || rawFrame.length !== 6)
      throw new InvalidSerializedTransactionError({
        attributes: {},
        serializedTransaction,
        type: 'frame',
      })
    const [mode, flags, target, gasLimits, value, data] = rawFrame as [
      Hex,
      Hex,
      Hex,
      Hex[],
      Hex,
      Hex,
    ]
    if (!Array.isArray(gasLimits) || gasLimits.length !== 2)
      throw new InvalidSerializedTransactionError({
        attributes: {},
        serializedTransaction,
        type: 'frame',
      })
    const [gasLimit, stateGasLimit] = gasLimits as [Hex, Hex]
    const modeNum = minimalHexToNumber(mode)
    if (modeNum > 2)
      throw new InvalidSerializedTransactionError({
        attributes: {},
        serializedTransaction,
        type: 'frame',
      })
    return {
      mode: numberToFrameMode[modeNum as 0 | 1 | 2] ?? 'default',
      flags: minimalHexToNumber(flags),
      target: (target && target !== '0x' ? target : null) as Address | null,
      gasLimit: minimalHexToBigInt(gasLimit),
      stateGasLimit: minimalHexToBigInt(stateGasLimit),
      value: minimalHexToBigInt(value),
      data: data || '0x',
    } satisfies Frame
  })

  const signatures = rawSignatures.map((rawSignature) => {
    if (!Array.isArray(rawSignature) || rawSignature.length !== 4)
      throw new InvalidSerializedTransactionError({
        attributes: {},
        serializedTransaction,
        type: 'frame',
      })
    const [scheme, signer, msg, signature] = rawSignature
    return {
      scheme: minimalHexToNumber(scheme) as 0 | 1 | 2,
      signer: (signer === '0x'
        ? '0x0000000000000000000000000000000000000000'
        : signer) as Address,
      msg,
      signature,
    }
  })

  const recentRootReferences = rawRecentRootReferences.map((rawReference) => {
    if (!Array.isArray(rawReference) || rawReference.length !== 3)
      throw new InvalidSerializedTransactionError({
        attributes: {},
        serializedTransaction,
        type: 'frame',
      })
    const [sourceId, slot, root] = rawReference
    return { sourceId, slot: minimalHexToBigInt(slot), root }
  })

  const transaction: TransactionSerializableFrame = {
    chainId: minimalHexToNumber(chainId),
    nonceKeys: rawNonceKeys.map(minimalHexToBigInt),
    nonceSeq: minimalHexToBigInt(nonceSeq),
    sender: sender as Address,
    frames,
    signatures,
    recentRootReferences,
    type: 'frame',
  }

  if (isHex(maxPriorityFeePerGas) && maxPriorityFeePerGas !== '0x')
    transaction.maxPriorityFeePerGas = hexToBigInt(maxPriorityFeePerGas)
  if (isHex(maxFeePerGas) && maxFeePerGas !== '0x')
    transaction.maxFeePerGas = hexToBigInt(maxFeePerGas)
  if (isHex(maxFeePerBlobGas) && maxFeePerBlobGas !== '0x')
    transaction.maxFeePerBlobGas = hexToBigInt(maxFeePerBlobGas)
  if (Array.isArray(blobVersionedHashes) && blobVersionedHashes.length > 0)
    transaction.blobVersionedHashes = blobVersionedHashes

  // Apply the same static schema and semantic checks as outbound transactions.
  serializeFrameTransaction(transaction)

  return transaction
}

function minimalHexToNumber(value: Hex): number {
  return value === '0x' ? 0 : hexToNumber(value)
}

function minimalHexToBigInt(value: Hex): bigint {
  return value === '0x' ? 0n : hexToBigInt(value)
}
