import type { Address } from 'abitype'
import type { LocalAccount } from '../../accounts/types.js'
import { encodeFunctionData } from '../../utils/abi/encodeFunctionData.js'
import type { FrameAccount, FrameCall } from '../types/account.js'
import type { Frame } from '../types/frame.js'
import {
  makeEoaSignaturePlaceholder,
  signEoaTransaction,
} from '../utils/eoa.js'
import { toFrameAccount } from './toFrameAccount.js'

// ---------------------------------------------------------------------------
// ABI definitions for Simple8141Account
// ---------------------------------------------------------------------------

const validateAbi = [
  {
    type: 'function',
    name: 'validate',
    inputs: [{ name: 'signatureIndex', type: 'uint256' }],
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
   * - `1` = EXECUTION only
   * - `2` = PAYMENT only
   * - `3` = EXECUTION + PAYMENT
   * @default 3
   */
  scope?: 1 | 2 | 3 | undefined
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
    scope = 3,
  } = parameters

  return toFrameAccount({
    address,

    async signFrameTransaction() {
      const data = encodeFunctionData({
        abi: validateAbi,
        functionName: 'validate',
        args: [0n],
      })

      // Return single VERIFY frame targeting null (= tx.sender = this account)
      return [
        {
          mode: 'verify' as const,
          flags: scope,
          target: null,
          gasLimit: verifyGasLimit,
          value: 0n,
          data,
        },
      ] satisfies Frame[]
    },

    getTransactionSignaturePlaceholders: () => [
      makeEoaSignaturePlaceholder(owner.address),
    ],

    signTransactionSignatures: async ({ sigHash }) => [
      await signEoaTransaction(owner, sigHash),
    ],

    encodeCalls(calls: FrameCall[]) {
      return calls.map((call) => {
        if (call.value && call.value > 0n) {
          const data = encodeFunctionData({
            abi: executeAbi,
            functionName: 'execute',
            args: [call.to, call.value, call.data ?? '0x'],
          })
          return {
            mode: 'sender' as const,
            flags: 0,
            target: null,
            gasLimit: senderGasLimit,
            value: call.value,
            data,
          } satisfies Frame
        }
        // No value: raw SENDER frame targeting contract directly (gas-efficient)
        return {
          mode: 'sender' as const,
          flags: 0,
          target: call.to,
          gasLimit: senderGasLimit,
          value: 0n,
          data: call.data ?? '0x',
        } satisfies Frame
      })
    },
  })
}
