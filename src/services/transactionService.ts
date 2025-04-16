import * as ethers from 'ethers'
import { Alchemy, Network, AssetTransfersCategory } from 'alchemy-sdk'
import { ALCHEMY_CONFIG } from '../config'
import {
  AssetTransfersParams,
  TransactionBatch,
  FetchAllTransactionsParams
} from '../types'
import { QueueService } from './queueService'

export class TransactionService {
  private alchemy: Alchemy
  private walletAddress: string
  queueService: QueueService
  private incomingTxs: TransactionBatch = { transfers: [], pageKey: null }
  private outgoingTxs: TransactionBatch = { transfers: [], pageKey: null }

  constructor(address: string) {
    this.alchemy = new Alchemy({
      ...ALCHEMY_CONFIG,
      network: Network.ETH_MAINNET
    })
    this.walletAddress = address
    this.queueService = new QueueService(
      `${address.slice(0, 7)}...${address.slice(-5)}`
    )
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
    nextPageForIncoming,
    nextPageForOutgoing,
    _pageKey
  }: FetchAllTransactionsParams): Promise<void> {
    try {
      const address = this.walletAddress

      if (_pageKey) {
        // If the list of transactions returned is paginated.
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
        // If the list of transactions returned is not paginated.
        console.info(`Fetching transactions linked to ${address}...`)
        ;[this.incomingTxs, this.outgoingTxs] = await Promise.all([
          this.getAssetTransfers({ address, direction: 'incoming' }),
          this.getAssetTransfers({ address, direction: 'outgoing' })
        ])
      }

      console.info(
        `Incoming Txs: ${this.incomingTxs.transfers.length} | Outgoing Txs: ${
          this.outgoingTxs.transfers.length
        }.
      ${this.incomingTxs.pageKey ? 'More Incoming Txs to be fetched' : ''} | ${
          this.outgoingTxs.pageKey ? 'More Outgoing Txs to be fetched' : ''
        }`
      )

      // Receipt-fetching jobs created for every 1,000 (or less) transactions
      if (
        this.incomingTxs.transfers.length + this.outgoingTxs.transfers.length >=
        1000
      ) {
        await this.queueService.addJob({
          address,
          transactions: [
            ...this.incomingTxs.transfers,
            ...this.outgoingTxs.transfers
          ]
        })
        this.incomingTxs.transfers = []
        this.outgoingTxs.transfers = []
      }

      // Check if there are more pages for Incoming txs
      if (this.incomingTxs.pageKey) {
        await this.init({
          _pageKey: this.incomingTxs.pageKey,
          nextPageForIncoming: true
        })
        return
      }

      // Check if there are more pages for Outgoing txs
      if (this.outgoingTxs.pageKey) {
        await this.init({
          _pageKey: this.outgoingTxs.pageKey,
          nextPageForOutgoing: true
        })
        return
      }

      /** The following block is executed when it is needed to create receipt-fetching jobs for:
       * 1. When total transactions (in entire history) < 1000.
       * 2. When total transactions (in entire history) > 1000 and we're processing the last page of transactions.
       */
      if (
        this.incomingTxs.transfers.length + this.outgoingTxs.transfers.length >
        0
      ) {
        await this.queueService.addJob({
          address,
          transactions: [
            ...this.incomingTxs.transfers,
            ...this.outgoingTxs.transfers
          ]
        })
        this.incomingTxs.transfers = []
        this.outgoingTxs.transfers = []
      } else {
        console.info('-> No more transactions to fetch.')
      }

      // Wait for CSV Worker to complete its task, i.e. the last step.
      await new Promise<void>((resolve, reject) => {
        this.queueService.on('allJobsDone', async () => {
          try {
            await this.queueService.close()
            console.info('🎉 All jobs processed.')
            resolve()
          } catch (error) {
            reject(error)
          }
        })

        // Handle unahandled errors during processing
        this.queueService.on('error', async error => {
          await this.queueService.close()
          reject(error)
        })
      })
    } catch (error) {
      console.error('Error Occurred inside init(): ')
      console.error(error)
      await this.queueService.close()
      throw error // Re-throw to handle it in the calling code
    }
  }
}
