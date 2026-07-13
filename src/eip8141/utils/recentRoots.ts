import type { Address } from 'abitype'
import type { Account } from '../../accounts/types.js'
import { sendTransaction } from '../../actions/wallet/sendTransaction.js'
import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import type { Hash, Hex } from '../../types/misc.js'
import { isAddress } from '../../utils/address/isAddress.js'
import { concatHex } from '../../utils/data/concat.js'
import { isHex } from '../../utils/data/isHex.js'
import { getAction } from '../../utils/getAction.js'
import { keccak256 } from '../../utils/hash/keccak256.js'
import { RECENT_ROOT_ADDRESS } from '../constants.js'
import type { RecentRootReference } from '../types/transaction.js'

function assertBytes32(value: Hex, name: string) {
  if (!isHex(value) || value.length !== 66)
    throw new Error(`${name} must be 32 bytes.`)
}

export function computeSourceId(address: Address, salt: Hex): Hex {
  if (!isAddress(address)) throw new Error('Source address is invalid.')
  assertBytes32(salt, 'Salt')
  return keccak256(concatHex([address, salt]))
}

export function makeRootReference(parameters: RecentRootReference) {
  assertBytes32(parameters.sourceId, 'Source ID')
  assertBytes32(parameters.root, 'Root')
  if (parameters.slot < 0n || parameters.slot > 0xffff_ffff_ffff_ffffn)
    throw new Error('Slot does not fit uint64.')
  return { ...parameters }
}

export type WriteRecentRootParameters = {
  account?: Account | Address | undefined
  salt: Hex
  root: Hex
}

export async function writeRecentRoot<chain extends Chain | undefined>(
  client: Client<Transport, chain, Account | undefined>,
  parameters: WriteRecentRootParameters,
): Promise<Hash> {
  assertBytes32(parameters.salt, 'Salt')
  assertBytes32(parameters.root, 'Root')
  const account = parameters.account ?? client.account
  if (!account) throw new Error('writeRecentRoot requires an account.')
  const request = {
    account,
    data: concatHex([parameters.salt, parameters.root]),
    to: RECENT_ROOT_ADDRESS,
    value: 0n,
    chain: client.chain ?? null,
  }
  return getAction(client, sendTransaction, 'sendTransaction')(request as never)
}
