import type { LocalAccount } from '../../accounts/types.js'
import type { Hex } from '../../types/misc.js'
import { concatHex } from '../../utils/data/concat.js'
import { toHex, numberToHex } from '../../utils/encoding/toHex.js'
import { toRlp } from '../../utils/encoding/toRlp.js'
import { keccak256 } from '../../utils/hash/keccak256.js'
import { parseSignature } from '../../utils/signature/parseSignature.js'
import type { Frame } from '../types/frame.js'
import type { FrameCall } from '../types/account.js'

/**
 * EOA default code: RLP-batch all calls into a single SENDER frame.
 *
 * Format:
 * - byte 0: 0x02 (scope=0, mode=SENDER)
 * - bytes 1+: RLP([[target, value, data], ...])
 */
export function encodeEoaCalls(calls: FrameCall[], gasLimit: bigint): Frame[] {
  const callsRlp = toRlp(
    calls.map((call) => [
      call.to,
      call.value && call.value > 0n ? toHex(call.value) : '0x',
      call.data ?? '0x',
    ]),
  )
  return [
    {
      mode: 'sender' as const,
      target: null,
      gasLimit,
      data: concatHex(['0x02', callsRlp]),
    },
  ]
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
export async function signEoaVerify(
  account: LocalAccount,
  sigHash: Hex,
  options: { scope: number; gasLimit: bigint },
): Promise<Frame[]> {
  const { scope, gasLimit } = options

  // 2-byte header = data_without_signature
  const header = concatHex([
    numberToHex((scope << 4) | 0x1, { size: 1 }),
    '0x00',
  ])

  // hash = keccak256(sigHash || header)
  const hash = keccak256(concatHex([sigHash, header]))

  // Sign with LocalAccount.sign() — crypto primitive only
  const serializedSig = await account.sign!({ hash })
  const sig = parseSignature(serializedSig)
  const v = sig.v ? Number(sig.v) - 27 : sig.yParity

  return [
    {
      mode: 'verify' as const,
      target: null,
      gasLimit,
      data: concatHex([header, numberToHex(v, { size: 1 }), sig.r, sig.s]),
    },
  ]
}
