import type { Hex } from '../../types/misc.js'
import { toRlp } from '../../utils/encoding/toRlp.js'
import { frameModeToNumber } from '../types/frame.js'
import type { TransactionSerializableFrame } from '../types/transaction.js'

export const frameTransactionBaseGas = 15_000n
export const frameTransactionPerFrameGas = 475n
export const secp256k1SignatureGas = 2_800n
export const p256SignatureGas = 6_700n
export const recentRootBaseGas = 2_400n
export const recentRootPerReferenceGas = 2_002n

export function getFrameTransactionGas(
  transaction: TransactionSerializableFrame,
): bigint {
  const frames = transaction.frames.map((frame) => [
    minimalHex(frameModeToNumber[frame.mode]),
    minimalHex(frame.flags ?? 0),
    frame.target ?? '0x',
    minimalHex(frame.gasLimit),
    minimalHex(frame.value ?? 0n),
    frame.data,
  ])
  const signatures = transaction.signatures.map((signature) => [
    minimalHex(signature.scheme),
    signature.signer,
    signature.msg,
    signature.signature,
  ])
  const recentRootReferences = transaction.recentRootReferences.map(
    (reference) => [
      reference.sourceId,
      minimalHex(reference.slot),
      reference.root,
    ],
  )
  const calldataGas = eip7623CalldataGas(
    toRlp(frames),
    toRlp(signatures),
    toRlp(recentRootReferences),
  )
  const signatureGas = transaction.signatures.reduce(
    (gas, signature) =>
      gas + (signature.scheme === 0 ? secp256k1SignatureGas : p256SignatureGas),
    0n,
  )
  const executionGas = transaction.frames.reduce(
    (gas, frame) => gas + frame.gasLimit,
    0n,
  )
  const recentRootGas =
    recentRootReferences.length === 0
      ? 0n
      : recentRootBaseGas +
        BigInt(recentRootReferences.length) * recentRootPerReferenceGas
  return (
    frameTransactionBaseGas +
    BigInt(transaction.frames.length) * frameTransactionPerFrameGas +
    calldataGas +
    signatureGas +
    recentRootGas +
    executionGas
  )
}

function eip7623CalldataGas(...values: Hex[]): bigint {
  let tokens = 0n
  for (const value of values) {
    for (let index = 2; index < value.length; index += 2)
      tokens += value.slice(index, index + 2) === '00' ? 1n : 4n
  }
  return tokens * 10n
}

function minimalHex(value: number | bigint): Hex {
  if (value === 0 || value === 0n) return '0x'
  const hex = BigInt(value).toString(16)
  return `0x${hex.length % 2 === 0 ? hex : `0${hex}`}`
}
