import type { Address, Hex } from 'abitype'
import type { LocalAccount } from '../../accounts/types.js'
import { encodeFunctionData } from '../../utils/abi/encodeFunctionData.js'
import { parseSignature } from '../../utils/signature/parseSignature.js'
import type { Frame } from '../types/frame.js'
import type { FrameAccount, FrameCall } from '../types/account.js'
import { toFrameAccount } from './toFrameAccount.js'

// ---------------------------------------------------------------------------
// ABI definitions for Simple8141Account
// ---------------------------------------------------------------------------

const validateAbi = [
  {
    type: 'function',
    name: 'validate',
    inputs: [
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' },
      { name: 'scope', type: 'uint8' },
    ],
    outputs: [],
    stateMutability: 'view',
  },
] as const

const executeAbi = [
  {
    type: 'function',
    name: 'execute',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type ToSimple8141AccountParameters = {
  /** Deployed Simple8141Account address. */
  address: Address

  /** Owner EOA account (must have `sign` capability). */
  owner: LocalAccount

  /** Gas limit for the VERIFY frame. @default 200_000n */
  verifyGasLimit?: bigint | undefined

  /** Gas limit for each SENDER frame (execute call). @default 100_000n */
  senderGasLimit?: bigint | undefined

  /**
   * Validation scope:
   * - `0` = EXECUTION only
   * - `1` = PAYMENT only
   * - `2` = BOTH (execution + payment)
   * @default 2
   */
  scope?: 0 | 1 | 2 | undefined
}

export type ToSimple8141AccountReturnType = FrameAccount

/**
 * Creates a Simple8141Account frame account.
 *
 * This factory handles:
 * - Signing the frame transaction sigHash with the owner key
 * - Encoding `validate(v, r, s, scope)` into a VERIFY frame
 * - Encoding calls into `execute(target, value, data)` SENDER frames
 *
 * @example
 * ```ts
 * import { privateKeyToAccount } from 'viem/accounts'
 * import { toSimple8141Account } from 'viem/eip8141'
 *
 * const owner = privateKeyToAccount('0x...')
 * const account = toSimple8141Account({
 *   address: '0x...deployed-account...',
 *   owner,
 * })
 * ```
 */
export function toSimple8141Account(
  parameters: ToSimple8141AccountParameters,
): ToSimple8141AccountReturnType {
  const {
    address,
    owner,
    verifyGasLimit = 200_000n,
    senderGasLimit = 100_000n,
    scope = 2,
  } = parameters

  return toFrameAccount({
    address,

    async signFrameTransaction({ sigHash }) {
      // Sign the sigHash with the owner's private key
      const serializedSig = await owner.sign!({ hash: sigHash })
      const signature = parseSignature(serializedSig)

      // v is 27 or 28 (EIP-155). If v is undefined, derive from yParity.
      const v = signature.v
        ? Number(signature.v)
        : signature.yParity + 27

      // Encode validate(uint8 v, bytes32 r, bytes32 s, uint8 scope) calldata
      const data = encodeFunctionData({
        abi: validateAbi,
        functionName: 'validate',
        args: [v, signature.r, signature.s, scope],
      })

      // Return single VERIFY frame targeting null (= tx.sender = this account)
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
      return calls.map((call) => {
        // Each call is wrapped in execute(address target, uint256 value, bytes data)
        const data = encodeFunctionData({
          abi: executeAbi,
          functionName: 'execute',
          args: [call.to, call.value ?? 0n, call.data ?? '0x'],
        })

        // SENDER frame targets null (= tx.sender = this account)
        return {
          mode: 'sender' as const,
          target: null,
          gasLimit: senderGasLimit,
          data,
        } satisfies Frame
      })
    },
  })
}
