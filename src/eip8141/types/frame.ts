import type { Address } from 'abitype'
import type { Log } from '../../types/log.js'
import type { Hex } from '../../types/misc.js'
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
  /** Approval scope bits (0-1) and atomic-batch continuation bit (2). */
  flags?: number | undefined
  /** Call target address. `null` means the frame targets `tx.sender`. */
  target: Address | null
  /** Gas limit allocated to this frame. */
  gasLimit: bigint
  /** Native value transferred by a SENDER frame. */
  value?: bigint | undefined
  /** Calldata for the frame. */
  data: Hex
}

// ---------------------------------------------------------------------------
// RPC Frame (hex-encoded, as returned from JSON-RPC)
// ---------------------------------------------------------------------------

export type RpcFrame = {
  mode: Hex
  flags: Hex
  target: Address | Hex
  gasLimit: Hex
  value: Hex
  data: Hex
}

// ---------------------------------------------------------------------------
// Frame Receipt
// ---------------------------------------------------------------------------

export type FrameReceiptStatus = '0x0' | '0x1' | '0x2'

export type FrameReceipt = {
  /** Frame execution status (0x0=failed, 0x1=successful, 0x2=skipped). */
  status: FrameReceiptStatus
  /** Gas used by this frame. */
  gasUsed: bigint
  /** Logs emitted during this frame. */
  logs: Log[]
}

export type RpcFrameReceipt = {
  status: FrameReceiptStatus
  gasUsed: Hex
  logs: RpcLog[]
}
