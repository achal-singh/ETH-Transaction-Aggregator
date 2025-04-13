import * as ethers from 'ethers'
import { Alchemy, Network, AssetTransfersCategory } from 'alchemy-sdk'
import { ALCHEMY_CONFIG } from '../config'
import {
  Transaction,
  AssetTransfersParams,
  TransactionBatch,
  FetchAllTransactionsParams
} from '../types'
import { delay, writeToCSV } from '../utils'

export class TransactionService {
  private alchemy: Alchemy
  private incomingTxs: TransactionBatch = { transfers: [], pageKey: null }
  private outgoingTxs: TransactionBatch = { transfers: [], pageKey: null }

  constructor() {
    this.alchemy = new Alchemy({
      ...ALCHEMY_CONFIG,
      network: Network.ETH_MAINNET
    })
  }

  /**
   * Fetches the gas cost for every transactions and aggregates it with
   * the rest of the transaction data and writes it to a CSV file.
   * @param address - The wallet address to fetch transactions for
   * @param transactions - The transaction data to process
   */
  private async processTransactions(
    address: string,
    transactions: any[]
  ): Promise<void> {
    console.info(`Processing ${transactions.length} transactions... ⌛️`)
    const BATCH_SIZE = 300
    let finalTxBatch: Transaction[] = []

    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      let chunk = transactions.slice(i, i + BATCH_SIZE)
      console.info(
        `-> Processing batch ${i / BATCH_SIZE + 1} (${chunk.length} txs)`
      )

      try {
        let receipts = await Promise.all(
          chunk.map(tx => this.alchemy.core.getTransactionReceipt(tx.hash))
        )

        for (let j = 0; j < chunk.length; j++) {
          const tx = chunk[j]
          const receipt = receipts[j]
          if (!receipt) continue

          finalTxBatch.push({
            transactionHash: tx.hash,
            from: tx.from,
            to: tx.to!,
            tx_type: tx.category!,
            asset_address: tx.rawContract.address ?? null,
            asset_symbol: tx.asset!,
            nft_tokenId: tx.erc721TokenId ?? null,
            value: tx.value!,
            gasFeeEth: ethers.formatEther(
              BigInt(receipt.gasUsed._hex) *
                BigInt(receipt.effectiveGasPrice._hex)
            ),
            timestamp: tx.metadata.blockTimestamp!
          })
        }

        chunk = []
        receipts = []
      } catch (err) {
        console.error(`❌ Error in batch starting at ${i}:`, err)
        // A retry machanism can be implemented here
        break
      }
    }

    console.info(`✅ Finished processing ${finalTxBatch.length} transactions.`)
    await writeToCSV(address, finalTxBatch)
    finalTxBatch = []
    await delay(5000) // Sleeping for 5 seconds
  }

  /**
   * Fetches all the asset transfer transactions for a given address
   * and direction (incoming or outgoing).
   */
  private async getAssetTransfers({
    address,
    direction,
    pageKey
  }: AssetTransfersParams) {
    const response = await this.alchemy.core.getAssetTransfers({
      [direction === 'incoming' ? 'toAddress' : 'fromAddress']: address,
      excludeZeroValue: true,
      category: [
        AssetTransfersCategory.EXTERNAL,
        AssetTransfersCategory.INTERNAL,
        AssetTransfersCategory.ERC20,
        AssetTransfersCategory.ERC721,
        AssetTransfersCategory.ERC1155
      ],
      withMetadata: true,
      pageKey
    })

    return {
      transfers: response.transfers,
      pageKey: response.pageKey ?? null
    }
  }

  /**
   * The master/entry-point function that initializes the process of fetching and processing
   * transactions associated to the wallet address
   * @param address - The wallet address to fetch transactions for
   * @param nextPageForIncoming - Boolean indicating if there is a next page for incoming transactions
   * @param nextPageForOutgoing - Boolean indicating if there is a next page for outgoing transactions
   * @param _pageKey - The page key reference to fetch the next page of transactions
   */
  public async init({
    address,
    nextPageForIncoming,
    nextPageForOutgoing,
    _pageKey
  }: FetchAllTransactionsParams): Promise<void> {
    try {
      if (_pageKey) {
        if (nextPageForOutgoing) {
          const res = await this.getAssetTransfers({
            address,
            direction: 'outgoing',
            pageKey: _pageKey
          })

          this.outgoingTxs.transfers.push(...res.transfers)
          this.outgoingTxs.pageKey = res.pageKey
        }
        if (nextPageForIncoming) {
          const res = await this.getAssetTransfers({
            address,
            direction: 'incoming',
            pageKey: _pageKey
          })

          this.incomingTxs.transfers.push(...res.transfers)
          this.incomingTxs.pageKey = res.pageKey
        }
      } else {
        console.info(`Fetching transactions linked to ${address}...`)
        ;[this.incomingTxs, this.outgoingTxs] = await Promise.all([
          this.getAssetTransfers({ address, direction: 'incoming' }),
          this.getAssetTransfers({ address, direction: 'outgoing' })
        ])
      }

      console.info(
        `Total Incoming Txs for ${address}: ${this.incomingTxs.transfers.length} `
      )
      console.info(
        `Total Outgoing Txs for ${address}: ${this.outgoingTxs.transfers.length}\n`
      )

      /* Creating a CSV file for every 1,000 transactions to keep memory usage in check*/
      if (
        this.incomingTxs.transfers.length + this.outgoingTxs.transfers.length >=
        1_000
      ) {
        await this.processTransactions(address, [
          ...this.incomingTxs.transfers,
          ...this.outgoingTxs.transfers
        ])
        this.incomingTxs.transfers = []
        this.outgoingTxs.transfers = []
      }

      if (this.incomingTxs.pageKey) {
        await this.init({
          address,
          _pageKey: this.incomingTxs.pageKey,
          nextPageForIncoming: true
        })
        return
      }
      if (this.outgoingTxs.pageKey) {
        await this.init({
          address,
          _pageKey: this.outgoingTxs.pageKey,
          nextPageForOutgoing: true
        })
        return
      }

      // The last set of transactions in the history are processed here
      await this.processTransactions(address, [
        ...this.incomingTxs.transfers,
        ...this.outgoingTxs.transfers
      ])
      this.incomingTxs.transfers = []
      this.outgoingTxs.transfers = []
    } catch (error) {
      console.error('Error Occurred inside init(): ')
      console.error(error)
    }
  }
}
