import type { Address } from 'abitype'
import { getStorageAt } from '../../actions/public/getStorageAt.js'
import { getTransactionCount } from '../../actions/public/getTransactionCount.js'
import type { Client } from '../../clients/createClient.js'
import type { Transport } from '../../clients/transports/createTransport.js'
import type { Chain } from '../../types/chain.js'
import { concatHex } from '../../utils/data/concat.js'
import { padHex } from '../../utils/data/pad.js'
import { hexToBigInt } from '../../utils/encoding/fromHex.js'
import { toHex } from '../../utils/encoding/toHex.js'
import { getAction } from '../../utils/getAction.js'
import { keccak256 } from '../../utils/hash/keccak256.js'
import { NONCE_MANAGER_ADDRESS } from '../constants.js'

export type GetKeyedNonceParameters = {
  sender: Address
  key: bigint
}

export async function getKeyedNonce<chain extends Chain | undefined>(
  client: Client<Transport, chain>,
  { sender, key }: GetKeyedNonceParameters,
): Promise<bigint> {
  if (key < 0n || key >= 1n << 256n)
    throw new Error('Nonce key does not fit uint256.')
  if (key === 0n)
    return BigInt(
      await getAction(
        client,
        getTransactionCount,
        'getTransactionCount',
      )({
        address: sender,
        blockTag: 'pending',
      }),
    )
  const slot = keccak256(
    concatHex([padHex(sender, { size: 32 }), toHex(key, { size: 32 })]),
  )
  const value = await getAction(
    client,
    getStorageAt,
    'getStorageAt',
  )({
    address: NONCE_MANAGER_ADDRESS,
    slot,
    blockTag: 'pending',
  })
  return value ? hexToBigInt(value) : 0n
}
