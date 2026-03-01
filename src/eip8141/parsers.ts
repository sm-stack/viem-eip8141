import { InvalidSerializedTransactionError } from '../errors/transaction.js'
import type { Address, Hex } from '../types/misc.js'
import { isHex } from '../utils/data/isHex.js'
import { sliceHex } from '../utils/data/slice.js'
import { fromRlp } from '../utils/encoding/fromRlp.js'
import { hexToBigInt, hexToNumber } from '../utils/encoding/fromHex.js'
import {
  type ParseTransactionReturnType as ParseTransactionReturnType_,
  parseTransaction as parseTransaction_,
} from '../utils/transaction/parseTransaction.js'
import { numberToFrameMode } from './types/frame.js'
import type { Frame } from './types/frame.js'
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
>(
  serializedTransaction: serialized,
): ParseTransactionReturnType<serialized> {
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

  if (!Array.isArray(transactionArray) || transactionArray.length !== 8)
    throw new InvalidSerializedTransactionError({
      attributes: {},
      serializedTransaction,
      type: 'frame',
    })

  const [
    chainId,
    nonce,
    sender,
    rawFrames,
    maxPriorityFeePerGas,
    maxFeePerGas,
    maxFeePerBlobGas,
    blobVersionedHashes,
  ] = transactionArray as [Hex, Hex, Hex, Hex[][], Hex, Hex, Hex, Hex[]]

  // Parse frames
  const frames: Frame[] = (rawFrames as unknown as Hex[][]).map(
    (rawFrame) => {
      const [mode, target, gasLimit, data] = rawFrame as [
        Hex,
        Hex,
        Hex,
        Hex,
      ]
      const modeNum = hexToNumber(mode || '0x0')
      return {
        mode: numberToFrameMode[modeNum as 0 | 1 | 2] ?? 'default',
        target: (target && target !== '0x' ? target : null) as Address | null,
        gasLimit: hexToBigInt(gasLimit || '0x0'),
        data: data || '0x',
      } satisfies Frame
    },
  )

  const transaction: TransactionSerializableFrame = {
    chainId: hexToNumber(chainId || '0x0'),
    nonce: hexToNumber(nonce || '0x0'),
    sender: sender as Address,
    frames,
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

  return transaction
}
