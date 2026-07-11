import type { LocalAccount } from '../../accounts/types.js'
import type { Hex } from '../../types/misc.js'
import { concatHex } from '../../utils/data/concat.js'
import { numberToHex } from '../../utils/encoding/toHex.js'
import { parseSignature } from '../../utils/signature/parseSignature.js'
import type { FrameCall } from '../types/account.js'
import type { Frame } from '../types/frame.js'
import type { TxSignature } from '../types/transaction.js'

/**
 * EOA calls map directly to SENDER frames.
 */
export function encodeEoaCalls(calls: FrameCall[], gasLimit: bigint): Frame[] {
  return calls.map((call) => ({
    mode: 'sender' as const,
    flags: 0,
    target: call.to,
    gasLimit,
    value: call.value ?? 0n,
    data: call.data ?? '0x',
  }))
}

/**
 * EOA default code: build VERIFY frame with ECDSA signature.
 *
 * Uses `account.sign()` — the crypto primitive on LocalAccount.
 *
 * Format:
 * - byte 0: (scope << 4) | 0x1
 * - byte 1: 0x00 (ECDSA)
 * - bytes 2+: v(1) + r(32) + s(32)
 */
export async function signEoaTransaction(
  account: LocalAccount,
  sigHash: Hex,
): Promise<TxSignature> {
  const serializedSig = await account.sign!({ hash: sigHash })
  const sig = parseSignature(serializedSig)
  const v = sig.v ? Number(sig.v) - 27 : sig.yParity
  return {
    scheme: 0,
    signer: account.address,
    msg: '0x',
    signature: concatHex([numberToHex(v, { size: 1 }), sig.r, sig.s]),
  }
}

export function makeEoaSignaturePlaceholder(
  signer: LocalAccount['address'],
): TxSignature {
  return { scheme: 0, signer, msg: '0x', signature: `0x${'00'.repeat(65)}` }
}
