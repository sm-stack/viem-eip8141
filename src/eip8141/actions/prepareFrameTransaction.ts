import type { LocalAccount } from '../../accounts/types.js'
import type { Hex } from '../../types/misc.js'
import { getChainId } from '../../actions/public/getChainId.js'
import { getTransactionCount } from '../../actions/public/getTransactionCount.js'
import { estimateFeesPerGas } from '../../actions/public/estimateFeesPerGas.js'
import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import { getAction } from '../../utils/getAction.js'
import { computeSigHash } from '../utils/computeSigHash.js'
import { encodeEoaCalls, signEoaVerify } from '../utils/eoa.js'
import type { Frame } from '../types/frame.js'
import type { FrameAccount, FrameCall, FramePaymaster } from '../types/account.js'
import type { TransactionSerializableFrame } from '../types/transaction.js'

// ---------------------------------------------------------------------------
// Parameters (same as sendFrameTransaction, without send-specific options)
// ---------------------------------------------------------------------------

export type PrepareFrameTransactionParameters = {
  /** Frame account or LocalAccount (EOA). */
  account: FrameAccount | LocalAccount
  calls?: FrameCall[] | undefined
  frames?: Frame[] | undefined
  paymaster?: FramePaymaster | undefined
  nonce?: number | undefined
  chainId?: number | undefined
  maxPriorityFeePerGas?: bigint | undefined
  maxFeePerGas?: bigint | undefined
  maxFeePerBlobGas?: bigint | undefined
  blobVersionedHashes?: Hex[] | undefined

  // EOA options (only used when account is a LocalAccount)
  /** Validation scope (0=execution, 2=both). @default 2 */
  scope?: 0 | 2 | undefined
  /** VERIFY frame gas limit. @default 200_000n */
  verifyGasLimit?: bigint | undefined
  /** SENDER frame gas limit. @default 200_000n */
  senderGasLimit?: bigint | undefined
}

export type PrepareFrameTransactionReturnType = TransactionSerializableFrame

/**
 * Prepares an EIP-8141 frame transaction without sending it.
 *
 * For EOA accounts (`account.type === 'local'`), frame building is handled
 * directly by this action using the EOA default code protocol.
 * For custom frame accounts (`account.type === 'eip8141'`), frame building
 * is delegated to the account's methods.
 */
export async function prepareFrameTransaction<
  chain extends Chain | undefined,
>(
  client: Client<Transport, chain>,
  parameters: PrepareFrameTransactionParameters,
): Promise<PrepareFrameTransactionReturnType> {
  const {
    calls,
    frames: rawFrames,
    paymaster,
    maxFeePerBlobGas,
    blobVersionedHashes,
  } = parameters

  const address = parameters.account.address

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
    )({ address, blockTag: 'pending' }))

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
    // ── Account type branching ────────────────────────────────────
    // EOA: action builds frames directly (first-class, viem pattern)
    // FrameAccount: delegates to account methods (extension pattern)
    let senderFrames: Frame[]
    let signVerify: (sigHash: Hex) => Promise<Frame[]>
    let deployFrame: Frame | undefined

    if (parameters.account.type === 'local') {
      const {
        scope = 2,
        verifyGasLimit = 200_000n,
        senderGasLimit = 200_000n,
      } = parameters
      senderFrames = encodeEoaCalls(calls, senderGasLimit)
      signVerify = (sigHash) =>
        signEoaVerify(parameters.account as LocalAccount, sigHash, {
          scope,
          gasLimit: verifyGasLimit,
        })
      deployFrame = undefined
    } else {
      const account = parameters.account as FrameAccount
      senderFrames = account.encodeCalls(calls)
      signVerify = (sigHash) => account.signFrameTransaction({ sigHash })
      deployFrame = await account.getDeployFrame?.()
    }

    const prefixFrames: Frame[] = deployFrame ? [deployFrame] : []

    const postOpFrame = paymaster?.getPostOpFrame?.()
    const postOpFrames: Frame[] = postOpFrame ? [postOpFrame] : []

    const baseTxFields = {
      chainId,
      nonce,
      sender: address,
      maxPriorityFeePerGas,
      maxFeePerGas,
      maxFeePerBlobGas,
      blobVersionedHashes,
      type: 'frame' as const,
    }

    // ── Phase 1: Probe ─────────────────────────────────────────────
    // Use placeholder VERIFY frames to get a preliminary sigHash,
    // then sign to discover actual gasLimits and frame structure.
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

    const probeAccountVerify = await signVerify(preliminarySigHash)
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
      accountVerifyFrames = await signVerify(sigHash)
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
    sender: address,
    frames: allFrames,
    maxPriorityFeePerGas,
    maxFeePerGas,
    maxFeePerBlobGas,
    blobVersionedHashes,
    type: 'frame',
  }
}
