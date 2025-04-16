import * as ethers from 'ethers'
import { SandboxedJob } from 'bullmq'
import { ALCHEMY_CONFIG } from '../config'
import { Alchemy, Network } from 'alchemy-sdk'
import { ProcessedTransaction } from '../types'

const alchemy = new Alchemy({
  ...ALCHEMY_CONFIG,
  network: Network.ETH_MAINNET
})

module.exports = async (
  job: SandboxedJob
): Promise<ProcessedTransaction[] | null> => {
  const { transactions } = job.data

  try {
    const txBatch: ProcessedTransaction[] = []
    // console.info(`Worker started with PID: ${process.pid}...`)
    console.info(
      `\n\n⛏️ Receipt-Worker (PID: ${process.pid}) executing Job: ${job.name} => Fetching Receipts of ${transactions.length} transactions...`
    )
    const receipts = await Promise.allSettled(
      transactions.map((tx: any) => alchemy.core.getTransactionReceipt(tx.hash))
    )

    for (let i = 0; i < transactions.length; i++) {
      const txData: ProcessedTransaction = {
        transactionHash: transactions[i].hash,
        from: transactions[i].from,
        to: transactions[i].to!,
        tx_type: transactions[i].category!,
        asset_address: transactions[i].rawContract.address ?? null,
        asset_symbol: transactions[i].asset!,
        nft_tokenId: transactions[i].erc721TokenId ?? null,
        value: transactions[i].value!,
        timestamp: transactions[i].metadata.blockTimestamp!
      }

      if (receipts[i].status === 'fulfilled') {
        const receipt = (receipts[i] as any).value
        if (Object.keys(receipt).length > 0 && 'gasUsed' in receipt) {
          txData.gasFeeEth = ethers.formatEther(
            BigInt((receipt as any).gasUsed._hex) *
              BigInt((receipt as any).effectiveGasPrice._hex)
          )
        } else {
          console.error(
            `Missing "gasUsed" field in Receipt for tx (${transactions[i].hash}). Receipt Response: `
          )
          console.dir(receipts[i])
        }
      } else {
        console.error(
          `\n⚠️ Receipt Promise failed with reason: ${
            (receipts[i] as any).reason.code
          }`
        )

        console.info(
          '⏳ Re-fetching Receipt Data for Tx with hash: ',
          transactions[i].hash
        )
        const data = await alchemy.core
          .getTransactionReceipt(transactions[i].hash)
          .catch(err => {
            console.error(
              'Re-fetch failed again for Tx Hash: ',
              transactions[i].hash,
              '.\nSetting fee as 0.'
            )
            txData.gasFeeEth = '0'
          })
        txData.gasFeeEth = ethers.formatEther(
          BigInt((data as any).gasUsed._hex) *
            BigInt((data as any).effectiveGasPrice._hex)
        )
      }
      txBatch.push(txData)
    }
    return txBatch
  } catch (error) {
    console.error(
      `Error Occurred in Receipt-Worker (PID: ${process.pid}) executing Job: ${job.name}: `
    )
    console.error(error)
    return null
  }
}
