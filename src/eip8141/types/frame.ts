import type { Address, Hex } from '../../types/misc.js'
import type { Log } from '../../types/log.js'
import type { RpcLog } from '../../types/rpc.js'

// ---------------------------------------------------------------------------
// Frame modes
// ---------------------------------------------------------------------------

export type FrameMode = 'default' | 'verify' | 'sender'

export const frameModeToNumber = {
  default: 0,
  verify: 1,
  sender: 2,
} as const satisfies Record<FrameMode, number>

export const numberToFrameMode = {
  0: 'default',
  1: 'verify',
  2: 'sender',
} as const satisfies Record<number, FrameMode>

// ---------------------------------------------------------------------------
// Frame (user-facing)
// ---------------------------------------------------------------------------

export type Frame = {
  /** Frame execution mode. */
  mode: FrameMode
  /** Call target address. `null` means the frame targets `tx.sender`. */
  target: Address | null
  /** Gas limit allocated to this frame. */
  gasLimit: bigint
  /** Calldata for the frame. */
  data: Hex
}

// ---------------------------------------------------------------------------
// RPC Frame (hex-encoded, as returned from JSON-RPC)
// ---------------------------------------------------------------------------

export type RpcFrame = {
  mode: Hex
  target: Address | Hex
  gasLimit: Hex
  data: Hex
}

// ---------------------------------------------------------------------------
// Frame Receipt
// ---------------------------------------------------------------------------

export type FrameReceipt = {
  /** Frame execution status hex (0x0=fail, 0x1=success, 0x2=approved_execution, 0x3=approved_payment, 0x4=approved_both). */
  status: Hex
  /** Gas used by this frame. */
  gasUsed: bigint
  /** Logs emitted during this frame. */
  logs: Log[]
}

export type RpcFrameReceipt = {
  status: Hex
  gasUsed: Hex
  logs: RpcLog[]
}
