import { TransactionService } from '../services'
import { retry, writeToCSV } from '../utils'
import { Alchemy } from 'alchemy-sdk'
import { ethers } from 'ethers'

jest.mock('alchemy-sdk')
jest.mock('ethers')
jest.mock('../utils')

// Mock console.error to prevent test output pollution
const mockConsoleError = jest
  .spyOn(console, 'error')
  .mockImplementation(() => {})

describe('TransactionService', () => {
  let service: TransactionService
  const mockAddress = '0xa39b189482f984388a34460636fea9eb181ad1a6'

  const mockTransfers = [
    {
      hash: '0x1',
      from: '0xfrom',
      to: '0xto',
      category: 'external',
      rawContract: { address: '0xcontract' },
      asset: 'ETH',
      value: '1000000000000000000',
      metadata: { blockTimestamp: '2023-01-01T00:00:00Z' }
    }
  ]

  const mockReceipt = {
    gasUsed: { _hex: '0x5208' },
    effectiveGasPrice: { _hex: '0x3b9aca00' }
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // 🧩 Mock the Alchemy class instance
    ;(Alchemy as jest.Mock).mockImplementation(() => ({
      core: {
        getAssetTransfers: jest.fn().mockResolvedValue({
          transfers: mockTransfers,
          pageKey: null
        }),
        getTransactionReceipt: jest.fn().mockResolvedValue(mockReceipt)
      }
    }))

    // 🧩 Mock ethers.formatEther
    ;(ethers.formatEther as jest.Mock).mockImplementation(gasFee => {
      return (typeof gasFee === 'bigint' ? gasFee : BigInt(gasFee)).toString()
    })

    // Utility mocks
    ;(retry as jest.Mock).mockImplementation(fn => fn())
    ;(writeToCSV as jest.Mock).mockResolvedValue(undefined)

    service = new TransactionService()
  })

  afterEach(() => {
    mockConsoleError.mockClear()
  })

  afterAll(() => {
    mockConsoleError.mockRestore()
  })

  describe('init', () => {
    it('should fetch both incoming and outgoing transactions', async () => {
      await service.init({ address: mockAddress })

      expect(service['alchemy'].core.getAssetTransfers).toHaveBeenCalledTimes(2)
    })

    it('should handle pagination when pageKey is present', async () => {
      // Mock first page with pageKey
      ;(service['alchemy'].core.getAssetTransfers as jest.Mock)
        .mockResolvedValueOnce({
          transfers: mockTransfers,
          pageKey: 'nextPage'
        })
        .mockResolvedValueOnce({
          transfers: mockTransfers,
          pageKey: null
        })

      await service.init({
        address: mockAddress,
        _pageKey: 'nextPage',
        nextPageForIncoming: true
      })

      expect(service['alchemy'].core.getAssetTransfers).toHaveBeenCalledTimes(2)
    })

    it('should process transactions in batches of 1000', async () => {
      // Create a large batch of transactions
      const largeBatch = []
      for (let i = 0; i < 1500; i++) {
        largeBatch.push({
          ...mockTransfers[0],
          hash: `0x${i.toString(16)}`
        })
      }

      ;(
        service['alchemy'].core.getAssetTransfers as jest.Mock
      ).mockResolvedValue({
        transfers: largeBatch,
        pageKey: null
      })

      await service.init({ address: mockAddress })

      expect(writeToCSV).toHaveBeenCalled()
      expect(service['incomingTxs'].transfers).toHaveLength(0)
      expect(service['outgoingTxs'].transfers).toHaveLength(0)
    })

    it('should handle API errors gracefully', async () => {
      const error = new Error('API Error')
      ;(
        service['alchemy'].core.getAssetTransfers as jest.Mock
      ).mockRejectedValue(error)

      await service.init({ address: mockAddress })
      
      expect(mockConsoleError).toHaveBeenCalledTimes(2)
      expect(mockConsoleError).toHaveBeenCalledWith(
        'Error Occurred inside init(): '
      )
      expect(mockConsoleError).toHaveBeenCalledWith(error)
    })
  })

  describe('processTransactions', () => {
    it('should process transactions and write to CSV', async () => {
      await service['processTransactions'](mockAddress, mockTransfers)

      expect(service['alchemy'].core.getTransactionReceipt).toHaveBeenCalledWith(mockTransfers[0].hash)
      expect(ethers.formatEther).toHaveBeenCalled()
      expect(writeToCSV).toHaveBeenCalledWith(mockAddress, expect.any(Array))
    })

    it('should handle errors in transaction processing', async () => {
      const error = new Error('Processing error')
      ;(service['alchemy'].core.getTransactionReceipt as jest.Mock).mockRejectedValue(error)

      await service['processTransactions'](mockAddress, mockTransfers)

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error in batch starting at 0:'),
        error
      )
    })
  })
})
