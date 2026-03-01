import { chainConfig } from '../../eip8141/chainConfig.js'
import { defineChain } from '../../utils/chain/defineChain.js'

export const eip8141Devnet = /*#__PURE__*/ defineChain({
  ...chainConfig,
  id: 1337,
  name: 'EIP-8141 Devnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['http://localhost:18545'],
    },
  },
  testnet: true,
})
