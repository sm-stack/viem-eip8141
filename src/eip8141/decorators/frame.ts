import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import {
  type PrepareFrameTransactionParameters,
  type PrepareFrameTransactionReturnType,
  prepareFrameTransaction,
} from '../actions/prepareFrameTransaction.js'
import {
  type SendFrameTransactionParameters,
  type SendFrameTransactionReturnType,
  sendFrameTransaction,
} from '../actions/sendFrameTransaction.js'

export type FrameActions = {
  /**
   * Builds, signs, and sends an EIP-8141 frame transaction.
   *
   * @example
   * ```ts
   * const hash = await client.sendFrameTransaction({
   *   account,
   *   calls: [{ to: '0x...', data: '0x...' }],
   * })
   * ```
   */
  sendFrameTransaction: (
    args: SendFrameTransactionParameters,
  ) => Promise<SendFrameTransactionReturnType>

  /**
   * Prepares an EIP-8141 frame transaction without sending it.
   */
  prepareFrameTransaction: (
    args: PrepareFrameTransactionParameters,
  ) => Promise<PrepareFrameTransactionReturnType>
}

export function frameActions() {
  return <
    transport extends Transport,
    chain extends Chain | undefined = Chain | undefined,
  >(
    client: Client<transport, chain>,
  ): FrameActions => ({
    sendFrameTransaction: (args) => sendFrameTransaction(client, args),
    prepareFrameTransaction: (args) => prepareFrameTransaction(client, args),
  })
}
