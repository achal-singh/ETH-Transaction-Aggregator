import {
  Alchemy,
  Network,
  AssetTransfersCategory,
  SortingOrder
} from 'alchemy-sdk'
import { ALCHEMY_CONFIG, ORDER, EXCLUDE_ZERO_VALUE_TXS } from '../config'
import { AssetTransfersParams, TransactionBatch } from '../types'
import { QueueService } from './queueService'

export class TransactionService {
  private alchemy: Alchemy
  private walletAddress: string
  queueService: QueueService
  private incomingTxs: TransactionBatch = { transfers: [] }
  private outgoingTxs: TransactionBatch = { transfers: [] }

  constructor(address: string) {
    this.alchemy = new Alchemy({
      ...ALCHEMY_CONFIG,
      network: Network.ETH_MAINNET
    })
    this.walletAddress = address
    this.queueService = new QueueService()
    this.setupSignalHandlers()
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
      excludeZeroValue: !!EXCLUDE_ZERO_VALUE_TXS,
      category: [
        AssetTransfersCategory.EXTERNAL,
        AssetTransfersCategory.INTERNAL,
        AssetTransfersCategory.ERC20,
        AssetTransfersCategory.ERC721,
        AssetTransfersCategory.ERC1155
      ],
      order: !!ORDER ? SortingOrder.DESCENDING : SortingOrder.ASCENDING,
      withMetadata: true,
      pageKey
    })
    return response
  }

  private async addJobToReceiptQueue(address: string) {
    await this.queueService.addReceiptJob({
      address,
      transactions: [
        ...this.incomingTxs.transfers,
        ...this.outgoingTxs.transfers
      ]
    })
    this.incomingTxs.transfers = []
    this.outgoingTxs.transfers = []
  }

  private async waitForJobsCompletion(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onComplete = () => {
        this.queueService.off('allJobsDone', onComplete)
        this.queueService.off('error', onError)
        resolve()
      }
      const onError = async (error: any) => {
        this.queueService.off('allJobsDone', onComplete)
        this.queueService.off('error', onError)
        await this.queueService.close()
        reject(error)
      }

      this.queueService.once('allJobsDone', onComplete)
      this.queueService.once('error', onError)
    })
  }

  /**
   * The master/entry-point function that initializes the process of fetching and processing
   * transactions associated to the wallet address
   * @param address - The wallet address to fetch transactions for
   * @param nextPageForIncoming - Boolean indicating if there is a next page for incoming transactions
   * @param nextPageForOutgoing - Boolean indicating if there is a next page for outgoing transactions
   * @param _pageKey - The page key reference to fetch the next page of transactions
   */
  public async init(): Promise<void> {
    try {
      const address = this.walletAddress
      await this.queueService.init(
        `${address.slice(0, 7)}...${address.slice(-5)}`
      )
      let hasMoreIncoming = true
      let hasMoreOutgoing = true

      console.info(`Fetching transactions linked to ${address}...`)
      const [incomingRes, outgoingRes] = await Promise.all([
        this.getAssetTransfers({ address, direction: 'incoming' }),
        this.getAssetTransfers({ address, direction: 'outgoing' })
      ])

      this.incomingTxs = incomingRes
      this.outgoingTxs = outgoingRes
      console.info(
        `Fetched total ${
          this.incomingTxs.transfers.length + this.outgoingTxs.transfers.length
        } transactions...`
      )
      hasMoreIncoming = !!incomingRes.pageKey
      hasMoreOutgoing = !!outgoingRes.pageKey

      await this.addJobToReceiptQueue(address)
      await this.waitForJobsCompletion()

      while (hasMoreIncoming || hasMoreOutgoing) {
        if (this.incomingTxs.pageKey) {
          console.info('\nFetching More Incoming Txs...')
          const res = await this.getAssetTransfers({
            address,
            direction: 'incoming',
            pageKey: this.incomingTxs.pageKey
          })

          this.incomingTxs.transfers = res.transfers
          this.incomingTxs.pageKey = res.pageKey ?? undefined
          hasMoreIncoming = !!res.pageKey
          console.info(
            `Incoming Txs: ${this.incomingTxs.transfers.length} | ${
              hasMoreIncoming ? 'More' : 'NO More'
            } Incoming Txs to be fetched`
          )
        }

        if (this.outgoingTxs.pageKey) {
          console.info('\nFetching More Outgoing Txs...')
          const res = await this.getAssetTransfers({
            address,
            direction: 'outgoing',
            pageKey: this.outgoingTxs.pageKey
          })

          this.outgoingTxs.transfers = res.transfers
          this.outgoingTxs.pageKey = res.pageKey ?? undefined
          hasMoreOutgoing = !!res.pageKey
          console.info(
            `Outgoing Txs: ${this.outgoingTxs.transfers.length}| ${
              hasMoreOutgoing ? 'More' : 'NO More'
            } Outgoing Txs to be fetched`
          )
        }

        await this.addJobToReceiptQueue(address)
        await this.waitForJobsCompletion()
      }
      await this.queueService.close()
    } catch (error) {
      console.error('Error Occurred inside init(): ')
      console.error(error)
      await this.queueService.close()
      throw error
    }
  }

  setupSignalHandlers() {
    const shutdown = async () => {
      console.info(
        '🛑 Received shutdown signal. Terminating Transaction Service...'
      )
      await this.queueService.close()
      console.info('✅ Transaction Service Terminated.')
      process.exit(0)
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }
}
