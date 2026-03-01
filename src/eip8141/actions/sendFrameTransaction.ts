import type { Address, Hex } from 'abitype'
import { getChainId } from '../../actions/public/getChainId.js'
import { getTransactionCount } from '../../actions/public/getTransactionCount.js'
import { estimateFeesPerGas } from '../../actions/public/estimateFeesPerGas.js'
import { sendRawTransaction } from '../../actions/wallet/sendRawTransaction.js'
import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import type { Hash } from '../../types/misc.js'
import { getAction } from '../../utils/getAction.js'
import { serializeFrameTransaction } from '../serializers.js'
import { computeSigHash } from '../utils/computeSigHash.js'
import type { Frame } from '../types/frame.js'
import type { FrameAccount, FrameCall, FramePaymaster } from '../types/account.js'
import type { TransactionSerializableFrame } from '../types/transaction.js'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type SendFrameTransactionParameters = {
  /** Frame account that will be the transaction sender. */
  account: FrameAccount

  /**
   * High-level calls to encode into SENDER frames.
   * Mutually exclusive with `frames`.
   */
  calls?: FrameCall[] | undefined

  /**
   * Raw frames to use directly (advanced mode).
   * Mutually exclusive with `calls`.
   */
  frames?: Frame[] | undefined

  /** Optional paymaster configuration. */
  paymaster?: FramePaymaster | undefined

  /** Override nonce (default: fetched via eth_getTransactionCount). */
  nonce?: number | undefined

  /** Override chain ID (default: from client.chain or eth_chainId). */
  chainId?: number | undefined

  /** Override maxPriorityFeePerGas. */
  maxPriorityFeePerGas?: bigint | undefined

  /** Override maxFeePerGas. */
  maxFeePerGas?: bigint | undefined

  /** Blob fee cap (for blob-carrying frame txs). */
  maxFeePerBlobGas?: bigint | undefined

  /** Blob versioned hashes (for blob-carrying frame txs). */
  blobVersionedHashes?: Hex[] | undefined
}

export type SendFrameTransactionReturnType = Hash

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/**
 * Builds, signs, and sends an EIP-8141 frame transaction.
 *
 * @example
 * ```ts
 * import { createPublicClient, http } from 'viem'
 * import { eip8141Devnet, toSimple8141Account, frameActions } from 'viem/eip8141'
 *
 * const client = createPublicClient({
 *   chain: eip8141Devnet,
 *   transport: http(),
 * }).extend(frameActions())
 *
 * const hash = await client.sendFrameTransaction({
 *   account,
 *   calls: [{ to: '0x...', data: '0x...' }],
 * })
 * ```
 */
export async function sendFrameTransaction<
  chain extends Chain | undefined,
>(
  client: Client<Transport, chain>,
  parameters: SendFrameTransactionParameters,
): Promise<SendFrameTransactionReturnType> {
  const {
    account,
    calls,
    frames: rawFrames,
    paymaster,
    maxFeePerBlobGas,
    blobVersionedHashes,
  } = parameters

  // ── 1. Chain ID ──────────────────────────────────────────────────────
  const chainId =
    parameters.chainId ??
    client.chain?.id ??
    (await getAction(client, getChainId, 'getChainId')({}))

  // ── 2. Nonce ─────────────────────────────────────────────────────────
  const nonce =
    parameters.nonce ??
    (await getAction(
      client,
      getTransactionCount,
      'getTransactionCount',
    )({ address: account.address, blockTag: 'pending' }))

  // ── 3. Fees ──────────────────────────────────────────────────────────
  let { maxFeePerGas, maxPriorityFeePerGas } = parameters

  if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) {
    const fees = await getAction(
      client,
      estimateFeesPerGas,
      'estimateFeesPerGas',
    )({ type: 'eip1559' } as any)
    if (maxFeePerGas === undefined)
      maxFeePerGas = fees.maxFeePerGas
    if (maxPriorityFeePerGas === undefined)
      maxPriorityFeePerGas = fees.maxPriorityFeePerGas
  }

  // ── 4. Build frames ──────────────────────────────────────────────────

  let allFrames: Frame[]

  if (rawFrames) {
    // Advanced mode: user provides raw frames directly
    allFrames = rawFrames
  } else if (calls) {
    // Auto-build mode: account encodes calls into SENDER frames
    const senderFrames = account.encodeCalls(calls)

    // Optional: account deploy frame at the front
    const deployFrame = await account.getDeployFrame?.()
    const prefixFrames: Frame[] = deployFrame ? [deployFrame] : []

    // Optional: paymaster postOp DEFAULT frame
    const postOpFrame = paymaster?.getPostOpFrame?.()
    const postOpFrames: Frame[] = postOpFrame ? [postOpFrame] : []

    const baseTxFields = {
      chainId,
      nonce,
      sender: account.address,
      maxPriorityFeePerGas,
      maxFeePerGas,
      maxFeePerBlobGas,
      blobVersionedHashes,
      type: 'frame' as const,
    }

    // ── Phase 1: Probe ─────────────────────────────────────────────
    // Use placeholder VERIFY frames to get a preliminary sigHash,
    // then call signFrameTransaction to discover actual gasLimits
    // and frame structure (account may return multiple VERIFY frames).
    const placeholderAccountVerify: Frame[] = [
      { mode: 'verify', target: null, gasLimit: 0n, data: '0x' },
    ]
    const placeholderPaymasterVerify: Frame[] = paymaster
      ? [{ mode: 'verify', target: paymaster.address, gasLimit: 0n, data: '0x' }]
      : []

    const preliminarySigHash = computeSigHash({
      ...baseTxFields,
      frames: [
        ...prefixFrames,
        ...placeholderAccountVerify,
        ...placeholderPaymasterVerify,
        ...senderFrames,
        ...postOpFrames,
      ],
    })

    const probeAccountVerify = await account.signFrameTransaction({
      sigHash: preliminarySigHash,
    })
    const probePaymasterVerify: Frame[] = paymaster
      ? [await paymaster.signFrameTransaction({ sigHash: preliminarySigHash })]
      : []

    // ── Phase 2: Correct ───────────────────────────────────────────
    // Rebuild skeleton with actual gasLimits/targets from probe.
    // computeSigHash zeros VERIFY data, so only gasLimit/target matter.
    const correctedSkeleton = [
      ...prefixFrames,
      ...probeAccountVerify.map((f) => ({ ...f, data: '0x' as Hex })),
      ...probePaymasterVerify.map((f) => ({ ...f, data: '0x' as Hex })),
      ...senderFrames,
      ...postOpFrames,
    ]

    const sigHash = computeSigHash({
      ...baseTxFields,
      frames: correctedSkeleton,
    })

    // ── Phase 3: Optimize ──────────────────────────────────────────
    // If corrected sigHash differs from probe, re-sign; else reuse.
    let accountVerifyFrames: Frame[]
    let paymasterVerifyFrames: Frame[]

    if (sigHash !== preliminarySigHash) {
      accountVerifyFrames = await account.signFrameTransaction({ sigHash })
      paymasterVerifyFrames = paymaster
        ? [await paymaster.signFrameTransaction({ sigHash })]
        : []
    } else {
      accountVerifyFrames = probeAccountVerify
      paymasterVerifyFrames = probePaymasterVerify
    }

    // Final frame order:
    // [deploy?] [accountVerify...] [paymasterVerify?] [sender...] [postOp?]
    allFrames = [
      ...prefixFrames,
      ...accountVerifyFrames,
      ...paymasterVerifyFrames,
      ...senderFrames,
      ...postOpFrames,
    ]
  } else {
    throw new Error(
      'sendFrameTransaction requires either `calls` or `frames` parameter.',
    )
  }

  // ── 5. Build final transaction ───────────────────────────────────────
  const transaction: TransactionSerializableFrame = {
    chainId,
    nonce,
    sender: account.address,
    frames: allFrames,
    maxPriorityFeePerGas,
    maxFeePerGas,
    maxFeePerBlobGas,
    blobVersionedHashes,
    type: 'frame',
  }

  // ── 6. Serialize ─────────────────────────────────────────────────────
  const serializedTransaction = serializeFrameTransaction(transaction)

  // ── 7. Send ──────────────────────────────────────────────────────────
  return await getAction(
    client,
    sendRawTransaction,
    'sendRawTransaction',
  )({ serializedTransaction })
}
