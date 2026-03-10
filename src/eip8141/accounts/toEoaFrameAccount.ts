import type { Address } from 'abitype'
import type { LocalAccount } from '../../accounts/types.js'
import type { Hex } from '../../types/misc.js'
import { concatHex } from '../../utils/data/concat.js'
import { toHex } from '../../utils/encoding/toHex.js'
import { numberToHex } from '../../utils/encoding/toHex.js'
import { toRlp } from '../../utils/encoding/toRlp.js'
import { keccak256 } from '../../utils/hash/keccak256.js'
import { parseSignature } from '../../utils/signature/parseSignature.js'
import type { Frame } from '../types/frame.js'
import type { FrameAccount, FrameCall } from '../types/account.js'
import { toFrameAccount } from './toFrameAccount.js'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type ToEoaFrameAccountParameters = {
  /** Gas limit for the VERIFY frame. @default 200_000n */
  verifyGasLimit?: bigint | undefined

  /** Gas limit for the SENDER frame (batched calls). @default 200_000n */
  senderGasLimit?: bigint | undefined

  /**
   * Validation scope:
   * - `0` = EXECUTION only (use when paymaster pays)
   * - `2` = BOTH (execution + payment)
   * @default 2
   */
  scope?: 0 | 2 | undefined
} & (
  | {
      /** Use ECDSA (secp256k1) signing. This is the default. */
      signatureType?: 'secp256k1' | undefined
      /** Owner EOA account (must have `sign` capability). */
      owner: LocalAccount
    }
  | {
      /** Use P256 (secp256r1) signing. */
      signatureType: 'p256'
      /** P256 sign function. Takes a 32-byte hash, returns r and s. */
      sign: (hash: Hex) => Promise<{ r: Hex; s: Hex }>
      /** P256 public key coordinates (each 32 bytes). */
      publicKey: { x: Hex; y: Hex }
    }
)

export type ToEoaFrameAccountReturnType = FrameAccount

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a frame account for EOAs using EIP-8141 default code.
 *
 * Supports both ECDSA (secp256k1) and P256 (secp256r1) signatures.
 * All calls are batched into a single SENDER frame via RLP encoding.
 *
 * @example ECDSA
 * ```ts
 * import { privateKeyToAccount } from 'viem/accounts'
 * import { toEoaFrameAccount } from 'viem/eip8141'
 *
 * const account = toEoaFrameAccount({
 *   owner: privateKeyToAccount('0x...'),
 * })
 * ```
 *
 * @example P256
 * ```ts
 * import { toEoaFrameAccount } from 'viem/eip8141'
 *
 * const account = toEoaFrameAccount({
 *   signatureType: 'p256',
 *   sign: async (hash) => p256Sign(hash, privateKey),
 *   publicKey: { x: '0x...', y: '0x...' },
 * })
 * ```
 *
 * @example Paymaster (scope=0, execution only)
 * ```ts
 * const account = toEoaFrameAccount({
 *   owner: privateKeyToAccount('0x...'),
 *   scope: 0,
 * })
 * ```
 */
export function toEoaFrameAccount(
  parameters: ToEoaFrameAccountParameters,
): ToEoaFrameAccountReturnType {
  const {
    verifyGasLimit = 200_000n,
    senderGasLimit = 200_000n,
    scope = 2,
  } = parameters

  const isP256 = parameters.signatureType === 'p256'

  // Derive address
  const address: Address = isP256
    ? (`0x${keccak256(concatHex([parameters.publicKey.x, parameters.publicKey.y])).slice(26)}` as Address)
    : parameters.owner.address

  return toFrameAccount({
    address,

    async signFrameTransaction({ sigHash }) {
      // 1. Build 2-byte header (= data_without_signature)
      //    byte 0: (scope << 4) | 0x1  — high nibble = APPROVE scope, low nibble = VERIFY mode
      //    byte 1: signature type       — 0x00 = ECDSA, 0x01 = P256
      const header = concatHex([
        numberToHex((scope << 4) | 0x1, { size: 1 }),
        isP256 ? '0x01' : '0x00',
      ])

      // 2. hash = keccak256(sigHash || data_without_signature)
      const hash = keccak256(concatHex([sigHash, header]))

      // 3. Sign and build frame data
      let data: Hex

      if (isP256) {
        const { r, s } = await parameters.sign(hash)
        data = concatHex([header, r, s, parameters.publicKey.x, parameters.publicKey.y])
      } else {
        const serializedSig = await parameters.owner.sign!({ hash })
        const sig = parseSignature(serializedSig)
        const v = sig.v ? Number(sig.v) : sig.yParity + 27
        data = concatHex([header, numberToHex(v, { size: 1 }), sig.r, sig.s])
      }

      return [
        {
          mode: 'verify' as const,
          target: null,
          gasLimit: verifyGasLimit,
          data,
        },
      ] satisfies Frame[]
    },

    encodeCalls(calls: FrameCall[]) {
      // All calls batched into a single SENDER frame via RLP
      // byte 0: 0x02 (scope=0, mode=SENDER)
      // bytes 1+: RLP([[target, value, data], ...])
      const callsRlp = toRlp(
        calls.map((call) => [
          call.to,
          call.value && call.value > 0n ? toHex(call.value) : '0x',
          call.data ?? '0x',
        ]),
      )
      const data = concatHex(['0x02', callsRlp])

      return [
        {
          mode: 'sender' as const,
          target: null,
          gasLimit: senderGasLimit,
          data,
        },
      ] satisfies Frame[]
    },
  })
}
