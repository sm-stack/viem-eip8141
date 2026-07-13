import type { LocalAccount } from '../../accounts/types.js'
import { estimateFeesPerGas } from '../../actions/public/estimateFeesPerGas.js'
import { getChainId } from '../../actions/public/getChainId.js'
import { getTransactionCount } from '../../actions/public/getTransactionCount.js'
import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import type { Hex } from '../../types/misc.js'
import { getAction } from '../../utils/getAction.js'
import type {
  FrameAccount,
  FrameCall,
  FramePaymaster,
} from '../types/account.js'
import type { Frame } from '../types/frame.js'
import type {
  RecentRootReference,
  TransactionSerializableFrame,
  TxSignature,
} from '../types/transaction.js'
import { computeSigHash } from '../utils/computeSigHash.js'
import {
  encodeEoaCalls,
  makeEoaSignaturePlaceholder,
  signEoaTransaction,
} from '../utils/eoa.js'
import { getKeyedNonce } from './getKeyedNonce.js'

// ---------------------------------------------------------------------------
// Parameters (same as sendFrameTransaction, without send-specific options)
// ---------------------------------------------------------------------------

export type PrepareFrameTransactionParameters = {
  /** Frame account or LocalAccount (EOA). */
  account: FrameAccount | LocalAccount
  calls?: FrameCall[] | undefined
  frames?: Frame[] | undefined
  signatures?: TxSignature[] | undefined
  recentRootReferences?: RecentRootReference[] | undefined
  paymaster?: FramePaymaster | undefined
  nonce?: number | undefined
  nonceKeys?: bigint[] | undefined
  nonceSeq?: bigint | undefined
  chainId?: number | undefined
  maxPriorityFeePerGas?: bigint | undefined
  maxFeePerGas?: bigint | undefined
  maxFeePerBlobGas?: bigint | undefined
  blobVersionedHashes?: Hex[] | undefined

  // EOA options (only used when account is a LocalAccount)
  /** Validation scope (2=execution, 3=execution+payment). @default 2 with paymaster, 3 otherwise */
  scope?: 2 | 3 | undefined
  /** VERIFY frame gas limit. @default 40_000n with paymaster, 90_000n otherwise */
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
export async function prepareFrameTransaction<chain extends Chain | undefined>(
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

  if (parameters.nonce !== undefined && parameters.nonceKeys !== undefined)
    throw new Error('Cannot specify both nonce and nonceKeys.')
  if (parameters.nonce !== undefined && parameters.nonceSeq !== undefined)
    throw new Error('Cannot specify both nonce and nonceSeq.')
  if (parameters.nonceSeq !== undefined && parameters.nonceKeys === undefined)
    throw new Error('nonceSeq requires nonceKeys.')

  let nonceKeys: bigint[]
  let nonceSeq: bigint
  if (parameters.nonce !== undefined) {
    nonceKeys = [0n]
    nonceSeq = BigInt(parameters.nonce)
  } else if (parameters.nonceKeys !== undefined) {
    nonceKeys = parameters.nonceKeys
    if (parameters.nonceSeq !== undefined) nonceSeq = parameters.nonceSeq
    else {
      const sequences = await Promise.all(
        nonceKeys.map((key) => getKeyedNonce(client, { sender: address, key })),
      )
      nonceSeq = sequences[0] ?? 0n
      if (sequences.some((sequence) => sequence !== nonceSeq))
        throw new Error('Selected nonce keys have different current sequences.')
    }
  } else {
    nonceKeys = [0n]
    nonceSeq = BigInt(
      await getAction(
        client,
        getTransactionCount,
        'getTransactionCount',
      )({ address, blockTag: 'pending' }),
    )
  }

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
  let signatures: TxSignature[]

  if (rawFrames) {
    allFrames = rawFrames
    signatures = parameters.signatures ?? []
  } else if (calls) {
    // ── Account type branching ────────────────────────────────────
    // EOA: action builds frames directly (first-class, viem pattern)
    // FrameAccount: delegates to account methods (extension pattern)
    let senderFrames: Frame[]
    let accountVerifyFrames: Frame[]
    let signaturePlaceholders: TxSignature[]
    let signTransactionSignatures:
      | ((sigHash: Hex) => Promise<TxSignature[]>)
      | undefined
    let deployFrame: Frame | undefined

    if (parameters.account.type === 'local') {
      const {
        scope = paymaster ? 2 : 3,
        verifyGasLimit = paymaster ? 40_000n : 90_000n,
        senderGasLimit = 200_000n,
      } = parameters
      senderFrames = encodeEoaCalls(calls, senderGasLimit)
      accountVerifyFrames = [
        {
          mode: 'verify',
          flags: scope,
          target: null,
          gasLimit: verifyGasLimit,
          value: 0n,
          data: '0x',
        },
      ]
      signaturePlaceholders = [
        makeEoaSignaturePlaceholder(parameters.account.address),
      ]
      signTransactionSignatures = async (sigHash) => [
        await signEoaTransaction(parameters.account as LocalAccount, sigHash),
      ]
      deployFrame = undefined
    } else {
      const account = parameters.account as FrameAccount
      senderFrames = account.encodeCalls(calls)
      accountVerifyFrames = await account.signFrameTransaction({
        sigHash: `0x${'00'.repeat(32)}`,
      })
      signaturePlaceholders =
        account.getTransactionSignaturePlaceholders?.() ?? []
      signTransactionSignatures = account.signTransactionSignatures
        ? (sigHash) => account.signTransactionSignatures!({ sigHash })
        : undefined
      deployFrame = await account.getDeployFrame?.()
    }

    const prefixFrames: Frame[] = deployFrame ? [deployFrame] : []

    const postOpFrame = paymaster?.getPostOpFrame?.()
    const postOpFrames: Frame[] = postOpFrame ? [postOpFrame] : []

    const baseTxFields = {
      chainId,
      nonceKeys,
      nonceSeq,
      sender: address,
      maxPriorityFeePerGas,
      maxFeePerGas,
      maxFeePerBlobGas,
      blobVersionedHashes,
      recentRootReferences: parameters.recentRootReferences ?? [],
      type: 'frame' as const,
    }

    const probePaymasterVerify: Frame[] = paymaster
      ? [
          await paymaster.signFrameTransaction({
            sigHash: `0x${'00'.repeat(32)}`,
          }),
        ]
      : []

    allFrames = [
      ...prefixFrames,
      ...accountVerifyFrames,
      ...probePaymasterVerify,
      ...senderFrames,
      ...postOpFrames,
    ]

    const paymasterSignaturePlaceholders =
      paymaster?.getTransactionSignaturePlaceholders?.() ?? []
    const allSignaturePlaceholders = [
      ...signaturePlaceholders,
      ...paymasterSignaturePlaceholders,
    ]
    const sigHash = computeSigHash({
      ...baseTxFields,
      frames: allFrames,
      signatures: allSignaturePlaceholders,
    })
    const accountSignatures = signTransactionSignatures
      ? await signTransactionSignatures(sigHash)
      : signaturePlaceholders
    const paymasterSignatures = paymaster?.signTransactionSignatures
      ? await paymaster.signTransactionSignatures({ sigHash })
      : paymasterSignaturePlaceholders
    signatures = [...accountSignatures, ...paymasterSignatures]
  } else {
    throw new Error(
      'prepareFrameTransaction requires either `calls` or `frames` parameter.',
    )
  }

  return {
    chainId,
    nonceKeys,
    nonceSeq,
    sender: address,
    frames: allFrames,
    signatures,
    recentRootReferences: parameters.recentRootReferences ?? [],
    maxPriorityFeePerGas,
    maxFeePerGas,
    maxFeePerBlobGas,
    blobVersionedHashes,
    type: 'frame',
  }
}
