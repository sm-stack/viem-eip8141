import type { Address } from 'abitype'
import type { Hex } from '../../types/misc.js'
import type { Frame } from './frame.js'
import type { TxSignature } from './transaction.js'

// ---------------------------------------------------------------------------
// Frame Call (high-level user intent)
// ---------------------------------------------------------------------------

export type FrameCall = {
  /** Target contract address. */
  to: Address
  /** ETH value to send (encoded via account's execute function). */
  value?: bigint | undefined
  /** Calldata for the target. */
  data?: Hex | undefined
}

// ---------------------------------------------------------------------------
// Frame Account
// ---------------------------------------------------------------------------

export type FrameAccount = {
  /** Deployed account address. */
  address: Address
  /** Account type discriminator. */
  type: 'eip8141'

  /**
   * Given the canonical signature hash, produce the VERIFY frame(s) for
   * this account. May also return preceding DEFAULT frames (e.g. for module
   * installation via Kernel's `enableInstall`).
   */
  signFrameTransaction: (parameters: { sigHash: Hex }) => Promise<Frame[]>

  /** Signature metadata used while computing the canonical signature hash. */
  getTransactionSignaturePlaceholders?: () => TxSignature[]

  /** Produce transaction-level signatures for the canonical signature hash. */
  signTransactionSignatures?: (parameters: {
    sigHash: Hex
  }) => Promise<TxSignature[]>

  /**
   * Encode high-level calls into SENDER frame(s).
   * The account implementation determines how calls are wrapped
   * (e.g. Simple8141Account uses `execute(address,uint256,bytes)`).
   */
  encodeCalls: (calls: FrameCall[]) => Frame[]

  /**
   * Optional: produce a DEFAULT frame for initial account deployment.
   * Returns `undefined` if the account is already deployed.
   */
  getDeployFrame?: () => Promise<Frame | undefined>
}

// ---------------------------------------------------------------------------
// Frame Paymaster
// ---------------------------------------------------------------------------

export type FramePaymaster = {
  /** Paymaster contract address. */
  address: Address

  /**
   * Given the canonical signature hash, produce the paymaster VERIFY frame.
   * This frame should call APPROVE(SCOPE_PAYMENT).
   */
  signFrameTransaction: (parameters: { sigHash: Hex }) => Promise<Frame>

  /**
   * Optional: produce a DEFAULT frame for post-operation processing
   * (e.g. ERC20Paymaster's `postOp`).
   */
  getPostOpFrame?: () => Frame | undefined
}
