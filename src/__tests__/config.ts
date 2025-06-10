export const TEST_CONFIG = {
  // Use real API when USE_REAL_API env variable is set to 'true'
  useRealApi: process.env.USE_REAL_API === 'true',
  
  // Test wallet with known transactions
  testWallet: process.env.TEST_WALLET_ADDRESS || '0xa39b189482f984388a34460636fea9eb181ad1a6',
  
  // Timeouts
  defaultTimeout: 5000,
  integrationTimeout: 30000,
  
  // Known transaction types for testing
  knownTransactions: {
    eth: {
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      value: '1000000000000000000', // 1 ETH
      category: 'external',
      asset: 'ETH'
    },
    erc20: {
      hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      from: '0x1234567890123456789012345678901234567890',
      to: '0x0987654321098765432109876543210987654321',
      value: '1000000',
      category: 'erc20',
      asset: 'USDC',
      rawContract: {
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' // USDC contract
      }
    }
  }
} 