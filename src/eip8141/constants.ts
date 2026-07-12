import type { Address } from 'abitype'

/** EIP-2718 transaction type byte for frame transactions. */
export const FRAME_TX_TYPE = 0x06

/** EIP-8141 system entry point address — caller in VERIFY/DEFAULT frames. */
export const ENTRY_POINT_ADDRESS =
  '0x00000000000000000000000000000000000000aa' as Address

/** EIP-8250 protocol-managed keyed nonce storage. */
export const NONCE_MANAGER_ADDRESS =
  '0x0000000000000000000000000000000000008250' as Address

/** Frame execution modes. */
export const FrameMode = {
  /** Execute frame as ENTRY_POINT. */
  DEFAULT: 0,
  /** Validation frame — must call APPROVE. Behaves like STATICCALL. */
  VERIFY: 1,
  /** Execute frame as tx.sender. Requires sender_approved. */
  SENDER: 2,
} as const
