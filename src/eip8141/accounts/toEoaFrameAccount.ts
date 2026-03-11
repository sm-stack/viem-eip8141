import type { Address } from 'abitype'
import type { LocalAccount } from '../../accounts/types.js'
import type { Hex } from '../../types/misc.js'
import { concatHex } from '../../utils/data/concat.js'
import { numberToHex } from '../../utils/encoding/toHex.js'
import { keccak256 } from '../../utils/hash/keccak256.js'
import type { Frame } from '../types/frame.js'
import type { FrameAccount, FrameCall } from '../types/account.js'
import { encodeEoaCalls, signEoaVerify } from '../utils/eoa.js'
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
 * For ECDSA EOAs, prefer passing `LocalAccount` directly to
 * `sendFrameTransaction` — this factory is mainly useful for P256
 * or when you need an explicit `FrameAccount` object.
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

  // ── ECDSA: reuse shared EOA utilities ──────────────────────────
  if (!isP256) {
    return toFrameAccount({
      address: parameters.owner.address,
      signFrameTransaction: ({ sigHash }) =>
        signEoaVerify(parameters.owner, sigHash, {
          scope,
          gasLimit: verifyGasLimit,
        }),
      encodeCalls: (calls: FrameCall[]) =>
        encodeEoaCalls(calls, senderGasLimit),
    })
  }

  // ── P256: custom signing logic ─────────────────────────────────
  const address = `0x${keccak256(concatHex([parameters.publicKey.x, parameters.publicKey.y])).slice(26)}` as Address

  return toFrameAccount({
    address,

    async signFrameTransaction({ sigHash }) {
      const header = concatHex([
        numberToHex((scope << 4) | 0x1, { size: 1 }),
        '0x01', // P256
      ])

      const hash = keccak256(concatHex([sigHash, header]))
      const { r, s } = await parameters.sign(hash)

      return [
        {
          mode: 'verify' as const,
          target: null,
          gasLimit: verifyGasLimit,
          data: concatHex([header, r, s, parameters.publicKey.x, parameters.publicKey.y]),
        },
      ] satisfies Frame[]
    },

    encodeCalls: (calls: FrameCall[]) => encodeEoaCalls(calls, senderGasLimit),
  })
}
