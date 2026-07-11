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
 * Signs the transaction sigHash for the EOA default-code verifier.
 *
 * Uses `account.sign()` — the crypto primitive on LocalAccount.
 *
 * The signature is stored in the transaction-level signatures list as
 * scheme 0 with a 65-byte yParity/r/s payload.
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
