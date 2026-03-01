import type { ChainFormatters } from '../types/chain.js'
import { hexToBigInt } from '../utils/encoding/fromHex.js'
import { formatLog } from '../utils/formatters/log.js'
import { defineTransaction } from '../utils/formatters/transaction.js'
import { defineTransactionReceipt } from '../utils/formatters/transactionReceipt.js'
import type { Frame, FrameReceipt, RpcFrame, RpcFrameReceipt } from './types/frame.js'
import type {
  Eip8141RpcFrameTransaction,
  Eip8141FrameTransaction,
  Eip8141RpcTransactionReceipt,
  Eip8141TransactionReceipt,
} from './types/transaction.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFrame(rpcFrame: RpcFrame): Frame {
  const modeNum = Number(rpcFrame.mode)
  const mode = modeNum === 1 ? 'verify' : modeNum === 2 ? 'sender' : 'default'
  return {
    mode,
    target: rpcFrame.target === '0x' ? null : rpcFrame.target,
    gasLimit: hexToBigInt(rpcFrame.gasLimit),
    data: rpcFrame.data,
  } as Frame
}

function formatFrameReceipt(rpcFr: RpcFrameReceipt): FrameReceipt {
  return {
    status: rpcFr.status,
    gasUsed: hexToBigInt(rpcFr.gasUsed),
    logs: rpcFr.logs?.map((log) => formatLog(log)) ?? [],
  }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export const formatters = {
  transaction: /*#__PURE__*/ defineTransaction({
    format(
      args: Eip8141RpcFrameTransaction,
    ): Eip8141FrameTransaction {
      const transaction = {} as Eip8141FrameTransaction
      if (args.type === '0x06') {
        transaction.sender = args.sender
        transaction.frames = args.frames?.map(formatFrame) ?? []
        transaction.type = 'frame'
      }
      return transaction
    },
  }),
  transactionReceipt: /*#__PURE__*/ defineTransactionReceipt({
    format(
      args: Eip8141RpcTransactionReceipt,
    ): Eip8141TransactionReceipt {
      return {
        payer: args.payer,
        frameReceipts:
          args.frameReceipts?.map(formatFrameReceipt) ?? [],
      } as Eip8141TransactionReceipt
    },
  }),
} as const satisfies ChainFormatters
