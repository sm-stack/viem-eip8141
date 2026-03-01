import type { Hex } from 'abitype'
import { getChainId } from '../../actions/public/getChainId.js'
import { getTransactionCount } from '../../actions/public/getTransactionCount.js'
import { estimateFeesPerGas } from '../../actions/public/estimateFeesPerGas.js'
import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import { getAction } from '../../utils/getAction.js'
import { computeSigHash } from '../utils/computeSigHash.js'
import type { Frame } from '../types/frame.js'
import type { FrameAccount, FrameCall, FramePaymaster } from '../types/account.js'
import type { TransactionSerializableFrame } from '../types/transaction.js'

// ---------------------------------------------------------------------------
// Parameters (same as sendFrameTransaction, without send-specific options)
// ---------------------------------------------------------------------------

export type PrepareFrameTransactionParameters = {
  account: FrameAccount
  calls?: FrameCall[] | undefined
  frames?: Frame[] | undefined
  paymaster?: FramePaymaster | undefined
  nonce?: number | undefined
  chainId?: number | undefined
  maxPriorityFeePerGas?: bigint | undefined
  maxFeePerGas?: bigint | undefined
  maxFeePerBlobGas?: bigint | undefined
  blobVersionedHashes?: Hex[] | undefined
}

export type PrepareFrameTransactionReturnType = TransactionSerializableFrame

/**
 * Prepares an EIP-8141 frame transaction without sending it.
 *
 * Useful for inspection, debugging, or manual serialization.
 */
export async function prepareFrameTransaction<
  chain extends Chain | undefined,
>(
  client: Client<Transport, chain>,
  parameters: PrepareFrameTransactionParameters,
): Promise<PrepareFrameTransactionReturnType> {
  const {
    account,
    calls,
    frames: rawFrames,
    paymaster,
    maxFeePerBlobGas,
    blobVersionedHashes,
  } = parameters

  const chainId =
    parameters.chainId ??
    client.chain?.id ??
    (await getAction(client, getChainId, 'getChainId')({}))

  const nonce =
    parameters.nonce ??
    (await getAction(
      client,
      getTransactionCount,
      'getTransactionCount',
    )({ address: account.address, blockTag: 'pending' }))

  let { maxFeePerGas, maxPriorityFeePerGas } = parameters

  if (maxFeePerGas === undefined || maxPriorityFeePerGas === undefined) {
    const fees = await getAction(
      client,
      estimateFeesPerGas,
      'estimateFeesPerGas',
    )({ type: 'eip1559' } as any)
    if (maxFeePerGas === undefined) maxFeePerGas = fees.maxFeePerGas
    if (maxPriorityFeePerGas === undefined)
      maxPriorityFeePerGas = fees.maxPriorityFeePerGas
  }

  let allFrames: Frame[]

  if (rawFrames) {
    allFrames = rawFrames
  } else if (calls) {
    const senderFrames = account.encodeCalls(calls)

    const deployFrame = await account.getDeployFrame?.()
    const prefixFrames: Frame[] = deployFrame ? [deployFrame] : []

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
      { mode: 'verify', target: null, gasLimit: 0n, data: '0x' as Hex },
    ]
    const placeholderPaymasterVerify: Frame[] = paymaster
      ? [{ mode: 'verify', target: paymaster.address, gasLimit: 0n, data: '0x' as Hex }]
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

    allFrames = [
      ...prefixFrames,
      ...accountVerifyFrames,
      ...paymasterVerifyFrames,
      ...senderFrames,
      ...postOpFrames,
    ]
  } else {
    throw new Error(
      'prepareFrameTransaction requires either `calls` or `frames` parameter.',
    )
  }

  return {
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
}
