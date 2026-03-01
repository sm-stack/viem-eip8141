import { sendRawTransaction } from '../../actions/wallet/sendRawTransaction.js'
import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import type { Hash } from '../../types/misc.js'
import { getAction } from '../../utils/getAction.js'
import { serializeFrameTransaction } from '../serializers.js'
import {
  prepareFrameTransaction,
  type PrepareFrameTransactionParameters,
} from './prepareFrameTransaction.js'

// ---------------------------------------------------------------------------
// Parameters
// ---------------------------------------------------------------------------

export type SendFrameTransactionParameters = PrepareFrameTransactionParameters

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
  const transaction = await prepareFrameTransaction(client, parameters)
  const serializedTransaction = serializeFrameTransaction(transaction)
  return await getAction(
    client,
    sendRawTransaction,
    'sendRawTransaction',
  )({ serializedTransaction })
}
