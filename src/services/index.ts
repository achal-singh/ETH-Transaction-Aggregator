import { TransactionService } from './transactionService'

async function createTransactionService(address: string) {
  return new TransactionService(address)
}

export type { TransactionService }
export { createTransactionService }
