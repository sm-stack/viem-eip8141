import type { Hex } from '../../types/misc.js'
import { toRlp } from '../../utils/encoding/toRlp.js'
import type { TransactionSerializableFrame } from '../types/transaction.js'

// Constants mirror params/protocol_params.go in 8141-geth (Bogota draft).
export const frameTransactionBaseGas = 12_000n
export const frameTransactionPerFrameGas = 475n
export const arbitrarySignatureGas = 100n
export const secp256k1SignatureGas = 2_800n
export const p256SignatureGas = 6_700n
export const recentRootBaseGas = 2_900n
export const recentRootPerReferenceGas = 2_102n
/** EIP-2780 value transfer cost charged per non-self SENDER value frame. */
export const valueTransferGas = 6_000n
/** Calldata token weights (EIP-7623) and per-token costs. */
export const calldataTokenPerNonZeroByte = 4n
export const calldataGasPerToken = 4n
/** EIP-7976 floor cost per calldata token. */
export const calldataFloorGasPerToken = 16n

const zeroAddress = '0x0000000000000000000000000000000000000000'

/**
 * Fixed (non-calldata, non-execution) intrinsic gas:
 * base + per-frame + signature verification + recent-root refs + value transfers.
 */
export function getFrameTransactionFixedGas(
  transaction: TransactionSerializableFrame,
): bigint {
  const signatureGas = transaction.signatures.reduce(
    (gas, signature) =>
      gas +
      (signature.scheme === 0
        ? arbitrarySignatureGas
        : signature.scheme === 1
          ? secp256k1SignatureGas
          : p256SignatureGas),
    0n,
  )
  const references = transaction.recentRootReferences.length
  const recentRootGas =
    references === 0
      ? 0n
      : recentRootBaseGas + BigInt(references) * recentRootPerReferenceGas
  const sender = transaction.sender.toLowerCase()
  const valueGas = transaction.frames.reduce((gas, frame) => {
    const value = frame.value ?? 0n
    if (
      value !== 0n &&
      frame.target !== null &&
      frame.target.toLowerCase() !== sender
    )
      return gas + valueTransferGas
    return gas
  }, 0n)
  return (
    frameTransactionBaseGas +
    BigInt(transaction.frames.length) * frameTransactionPerFrameGas +
    signatureGas +
    recentRootGas +
    valueGas
  )
}

/**
 * Calldata token count over the byte strings charged as frame tx data:
 * `rlp(nonceKeys) || rlp(nonceSeq)`, every `frame.data`, every signature's
 * `signer || msg || signature`, and `rlp(recentRootReferences)`.
 */
function getFrameTransactionCalldataTokens(
  transaction: TransactionSerializableFrame,
): bigint {
  const nonceKeys =
    transaction.nonceKeys ??
    (transaction.nonce !== undefined ? [0n] : undefined)
  const nonceSeq =
    transaction.nonceSeq ??
    (transaction.nonce !== undefined ? BigInt(transaction.nonce) : undefined)
  if (!nonceKeys || nonceSeq === undefined)
    throw new Error('Frame transaction nonceKeys requires nonceSeq.')
  const chunks: Hex[] = [
    toRlp(nonceKeys.map(minimalHex)),
    toRlp(minimalHex(nonceSeq)),
  ]
  for (const frame of transaction.frames) chunks.push(frame.data)
  for (const signature of transaction.signatures) {
    chunks.push(
      signature.signer.toLowerCase() === zeroAddress ? '0x' : signature.signer,
      signature.msg,
      signature.signature,
    )
  }
  chunks.push(
    toRlp(
      transaction.recentRootReferences.map((reference) => [
        reference.sourceId,
        minimalHex(reference.slot),
        reference.root,
      ]),
    ),
  )
  let tokens = 0n
  for (const value of chunks) {
    for (let index = 2; index < value.length; index += 2)
      tokens +=
        value.slice(index, index + 2) === '00'
          ? 1n
          : calldataTokenPerNonZeroByte
  }
  return tokens
}

/** Calldata gas charged up front (4 gas per token). */
export function getFrameTransactionCalldataGas(
  transaction: TransactionSerializableFrame,
): bigint {
  return getFrameTransactionCalldataTokens(transaction) * calldataGasPerToken
}

/**
 * Intrinsic gas: fixed + calldata. Matches `FrameTx.IntrinsicGas()` and the
 * shared `intrinsicGas` test vector.
 */
export function getFrameTransactionIntrinsicGas(
  transaction: TransactionSerializableFrame,
): bigint {
  return (
    getFrameTransactionFixedGas(transaction) +
    getFrameTransactionCalldataGas(transaction)
  )
}

/** EIP-7976 floor data gas: fixed + 16 gas per calldata token. */
export function getFrameTransactionFloorDataGas(
  transaction: TransactionSerializableFrame,
): bigint {
  return (
    getFrameTransactionFixedGas(transaction) +
    getFrameTransactionCalldataTokens(transaction) * calldataFloorGasPerToken
  )
}

/**
 * Total gas reserved by the transaction (`FrameTx.TotalGas()`):
 * `max(intrinsic + sum(frame.gasLimit), floor) + sum(frame.stateGasLimit)`.
 */
export function getFrameTransactionGas(
  transaction: TransactionSerializableFrame,
): bigint {
  const executionGas = transaction.frames.reduce(
    (gas, frame) => gas + frame.gasLimit,
    0n,
  )
  const stateGas = transaction.frames.reduce(
    (gas, frame) => gas + (frame.stateGasLimit ?? 0n),
    0n,
  )
  const intrinsic = getFrameTransactionIntrinsicGas(transaction) + executionGas
  const floor = getFrameTransactionFloorDataGas(transaction)
  return (intrinsic > floor ? intrinsic : floor) + stateGas
}

function minimalHex(value: number | bigint): Hex {
  if (value === 0 || value === 0n) return '0x'
  const hex = BigInt(value).toString(16)
  return `0x${hex.length % 2 === 0 ? hex : `0${hex}`}`
}
