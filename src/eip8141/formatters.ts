import type { ChainFormatters } from '../types/chain.js'
import { hexToBigInt, hexToNumber } from '../utils/encoding/fromHex.js'
import { formatLog } from '../utils/formatters/log.js'
import { defineTransaction } from '../utils/formatters/transaction.js'
import { defineTransactionReceipt } from '../utils/formatters/transactionReceipt.js'
import type {
  Frame,
  FrameReceipt,
  RpcFrame,
  RpcFrameReceipt,
} from './types/frame.js'
import type {
  Eip8141FrameTransaction,
  Eip8141RpcFrameTransaction,
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
    flags: hexToNumber(rpcFrame.flags),
    target: rpcFrame.target === '0x' ? null : rpcFrame.target,
    gasLimit: hexToBigInt(rpcFrame.gasLimit),
    value: hexToBigInt(rpcFrame.value),
    data: rpcFrame.data,
  } as Frame
}

function formatFrameReceipt(rpcFr: RpcFrameReceipt): FrameReceipt {
  if (
    rpcFr.status !== '0x0' &&
    rpcFr.status !== '0x1' &&
    rpcFr.status !== '0x3'
  )
    throw new Error(`Invalid frame receipt status ${rpcFr.status}.`)
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
    format(args: Eip8141RpcFrameTransaction): Eip8141FrameTransaction {
      const transaction = {} as Eip8141FrameTransaction
      if (args.type === '0x06') {
        transaction.nonceKeys = args.nonceKeys.map((key) => hexToBigInt(key))
        transaction.nonceSeq = hexToBigInt(args.nonceSeq)
        transaction.sender = args.sender
        transaction.frames = args.frames?.map(formatFrame) ?? []
        transaction.signatures =
          args.signatures?.map((signature) => ({
            scheme: hexToNumber(signature.scheme) as 0 | 1,
            signer: signature.signer,
            msg: signature.msg,
            signature: signature.signature,
          })) ?? []
        transaction.type = 'frame'
      }
      return transaction
    },
  }),
  transactionReceipt: /*#__PURE__*/ defineTransactionReceipt({
    format(args: Eip8141RpcTransactionReceipt): Eip8141TransactionReceipt {
      return {
        payer: args.payer,
        frameReceipts: args.frameReceipts?.map(formatFrameReceipt) ?? [],
      } as Eip8141TransactionReceipt
    },
  }),
} as const satisfies ChainFormatters
