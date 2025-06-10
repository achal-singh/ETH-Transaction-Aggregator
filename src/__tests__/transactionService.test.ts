import { TransactionService } from '../services/transactionService'
import { Alchemy } from 'alchemy-sdk'
import { EventEmitter } from 'events'
import { QueueService } from '../services/queueService'
import { TransactionBatch } from '../types'
import { TEST_CONFIG } from './config'
import './matchers'

jest.mock('alchemy-sdk')
jest.mock('../services/queueService')
// jest.setTimeout(20_000)

describe('TransactionService', () => {
  let service: TransactionService
  let mockQueueServiceEmitter: EventEmitter

  // Structure Tests
  describe('Structure Tests', () => {
    beforeEach(() => {
      jest.clearAllMocks()
      mockQueueServiceEmitter = new EventEmitter()

      // Mock Alchemy with known transaction types
      ;(Alchemy as unknown as jest.Mock).mockImplementation(() => ({
        core: {
          getAssetTransfers: jest.fn().mockResolvedValue({
            transfers: [
              TEST_CONFIG.knownTransactions.eth,
              TEST_CONFIG.knownTransactions.erc20
            ],
            pageKey: null
          })
        }
      }))
      ;(QueueService as unknown as jest.Mock).mockImplementation(() => {
        return {
          init: jest.fn(),
          addReceiptJob: jest.fn().mockResolvedValue(undefined),
          close: jest.fn().mockResolvedValue(undefined),
          once: mockQueueServiceEmitter.once.bind(mockQueueServiceEmitter),
          off: mockQueueServiceEmitter.off.bind(mockQueueServiceEmitter),
          emit: mockQueueServiceEmitter.emit.bind(mockQueueServiceEmitter)
        }
      })
      service = new TransactionService(TEST_CONFIG.testWallet)
    })

    it('should handle ETH transaction structure', async () => {
      const ethTx = TEST_CONFIG.knownTransactions.eth
      expect(ethTx).toHaveValidTransactionStructure()
      expect(ethTx.from).toBeValidEthereumAddress()
      expect(ethTx.to).toBeValidEthereumAddress()
      expect(ethTx.hash).toBeValidTransactionHash()
    })

    it('should handle ERC20 transaction structure', async () => {
      const erc20Tx = TEST_CONFIG.knownTransactions.erc20
      expect(erc20Tx).toHaveValidTransactionStructure()
      expect(erc20Tx.rawContract.address).toBeValidEthereumAddress()
    })
  })

  // Integration Tests
  describe('Integration Tests', () => {
    // Only run integration tests when explicitly enabled
    if (TEST_CONFIG.useRealApi) {
      beforeEach(() => {
        jest.setTimeout(TEST_CONFIG.integrationTimeout)
        // Use real services instead of mocks
        jest.unmock('alchemy-sdk')
        jest.unmock('../services/queueService')
        service = new TransactionService(TEST_CONFIG.testWallet)
      })

      it('should fetch real transactions from blockchain', async () => {
        const result = await service.init()

        // Verify we got some transactions
        expect(
          service['incomingTxs'].transfers.length +
            service['outgoingTxs'].transfers.length
        ).toBeGreaterThan(0)

        // Verify transaction structure
        const allTransfers = [
          ...service['incomingTxs'].transfers,
          ...service['outgoingTxs'].transfers
        ]

        allTransfers.forEach(tx => {
          expect(tx).toHaveValidTransactionStructure()
        })
      })

      it('should handle pagination with real data', async () => {
        // First call to get initial page
        const result1 = await service.init()

        // If we have a pageKey, test pagination
        if (service['incomingTxs'].pageKey || service['outgoingTxs'].pageKey) {
          const pageKey =
            service['incomingTxs'].pageKey || service['outgoingTxs'].pageKey
          if (pageKey) {
            // Add null check
            const result2 = await service.init()

            expect(result2).toBeDefined()
          }
        }
      })

      it('should process different transaction types', async () => {
        await service.init()

        const allTransfers = [
          ...service['incomingTxs'].transfers,
          ...service['outgoingTxs'].transfers
        ]

        // Check for ETH transfers
        const ethTransfers = allTransfers.filter(
          tx => tx.category === 'external' && tx.asset === 'ETH'
        )
        if (ethTransfers.length > 0) {
          expect(ethTransfers[0].value).toMatch(/^\d+$/)
        }

        // Check for ERC20 transfers
        const erc20Transfers = allTransfers.filter(
          tx => tx.category === 'erc20'
        )
        if (erc20Transfers.length > 0) {
          expect(
            erc20Transfers[0].rawContract.address
          ).toBeValidEthereumAddress()
        }
      })
    }
  })
})
