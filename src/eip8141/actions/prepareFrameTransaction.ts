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

    const paymasterVerifySkeleton: Frame[] = paymaster
      ? [{ mode: 'verify', target: paymaster.address, gasLimit: 200_000n, data: '0x' }]
      : []

    const postOpFrame = paymaster?.getPostOpFrame?.()
    const postOpFrames: Frame[] = postOpFrame ? [postOpFrame] : []

    const skeletonFrames = [
      ...prefixFrames,
      { mode: 'verify' as const, target: null, gasLimit: 200_000n, data: '0x' as Hex },
      ...paymasterVerifySkeleton,
      ...senderFrames,
      ...postOpFrames,
    ]

    const skeletonTx: TransactionSerializableFrame = {
      chainId,
      nonce,
      sender: account.address,
      frames: skeletonFrames,
      maxPriorityFeePerGas,
      maxFeePerGas,
      maxFeePerBlobGas,
      blobVersionedHashes,
      type: 'frame',
    }

    const sigHash = computeSigHash(skeletonTx)
    const accountVerifyFrames = await account.signFrameTransaction({ sigHash })

    const paymasterVerifyFrames: Frame[] = paymaster
      ? [await paymaster.signFrameTransaction({ sigHash })]
      : []

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
