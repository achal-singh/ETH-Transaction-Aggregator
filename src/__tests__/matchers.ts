import { AssetTransfersResult } from 'alchemy-sdk'

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveValidTransactionStructure(): R
      toBeValidEthereumAddress(): R
      toBeValidTransactionHash(): R
    }
  }
}

expect.extend({
  toHaveValidTransactionStructure(received: any) {
    const hasRequiredFields =
      received &&
      typeof received.hash === 'string' &&
      typeof received.from === 'string' &&
      typeof received.to === 'string' &&
      typeof received.value === 'string' &&
      typeof received.category === 'string'

    if (!hasRequiredFields) {
      return {
        message: () =>
          `expected ${received} to have valid transaction structure`,
        pass: false
      }
    }

    const isValidHash = /^0x[a-fA-F0-9]{64}$/.test(received.hash)
    const isValidFrom = /^0x[a-fA-F0-9]{40}$/.test(received.from)
    const isValidTo = /^0x[a-fA-F0-9]{40}$/.test(received.to)
    const isValidValue = /^\d+$/.test(received.value)

    return {
      message: () => `expected ${received} to have valid transaction structure`,
      pass: isValidHash && isValidFrom && isValidTo && isValidValue
    }
  },

  toBeValidEthereumAddress(received: string) {
    const pass = /^0x[a-fA-F0-9]{40}$/.test(received)
    return {
      message: () => `expected ${received} to be a valid Ethereum address`,
      pass
    }
  },

  toBeValidTransactionHash(received: string) {
    const pass = /^0x[a-fA-F0-9]{64}$/.test(received)
    return {
      message: () => `expected ${received} to be a valid transaction hash`,
      pass
    }
  }
})
