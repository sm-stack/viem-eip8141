import type { Address } from 'abitype'
import type { Hex } from '../../types/misc.js'
import type { Frame } from '../types/frame.js'
import type { FrameAccount, FrameCall } from '../types/account.js'

export type ToFrameAccountParameters = {
  /** Deployed account address. */
  address: Address

  /**
   * Given the canonical signature hash, produce the VERIFY frame(s).
   * May also return preceding DEFAULT frames (e.g. for module installation).
   */
  signFrameTransaction: (parameters: {
    sigHash: Hex
  }) => Promise<Frame[]>

  /**
   * Encode high-level calls into SENDER frame(s).
   * Defaults to one SENDER frame per call with raw data.
   */
  encodeCalls?: ((calls: FrameCall[]) => Frame[]) | undefined

  /**
   * Optional: produce a DEFAULT frame for initial account deployment.
   * Returns `undefined` if the account is already deployed.
   */
  getDeployFrame?: (() => Promise<Frame | undefined>) | undefined
}

export type ToFrameAccountReturnType = FrameAccount

/**
 * Creates a generic EIP-8141 frame account.
 *
 * This is a low-level factory. For specific account implementations
 * (e.g. Simple8141Account), use the dedicated factory functions.
 *
 * @example
 * ```ts
 * const account = toFrameAccount({
 *   address: '0x...',
 *   signFrameTransaction: async ({ sigHash }) => {
 *     // custom VERIFY frame logic
 *     return [{ mode: 'verify', target: null, gasLimit: 200_000n, data: '0x...' }]
 *   },
 * })
 * ```
 */
export function toFrameAccount(
  parameters: ToFrameAccountParameters,
): ToFrameAccountReturnType {
  const {
    address,
    signFrameTransaction,
    encodeCalls = defaultEncodeCalls,
    getDeployFrame,
  } = parameters

  return {
    address,
    type: 'eip8141',
    signFrameTransaction,
    encodeCalls,
    getDeployFrame,
  }
}

// ---------------------------------------------------------------------------
// Default encodeCalls: one SENDER frame per call with raw data
// ---------------------------------------------------------------------------

function defaultEncodeCalls(calls: FrameCall[]): Frame[] {
  return calls.map((call) => ({
    mode: 'sender' as const,
    target: call.to,
    gasLimit: 100_000n,
    data: call.data ?? '0x',
  }))
}
