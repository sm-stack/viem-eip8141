import type { Frame } from '../types/frame.js'

export const frameExpiryVerifierAddress =
  '0x0000000000000000000000000000000000008141'
export const frameFlagAtomicBatch = 4

export function makeExpiryFrame(deadline: bigint, gasLimit = 100_000n): Frame {
  if (deadline < 0n || deadline > 0xffff_ffff_ffff_ffffn)
    throw new RangeError('Expiry deadline must fit in uint64.')
  return {
    mode: 'verify',
    flags: 0,
    target: frameExpiryVerifierAddress,
    gasLimit,
    value: 0n,
    data: `0x${deadline.toString(16).padStart(16, '0')}`,
  }
}

export function withAtomicBatch(frames: readonly Frame[]): Frame[] {
  if (frames.length < 2)
    throw new Error('Atomic batch requires at least two frames.')
  return frames.map((frame, index) => ({
    ...frame,
    flags:
      index === frames.length - 1
        ? (frame.flags ?? 0) & ~frameFlagAtomicBatch
        : (frame.flags ?? 0) | frameFlagAtomicBatch,
  }))
}
