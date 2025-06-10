import * as dotenv from 'dotenv'
dotenv.config()
import { isAddress } from 'ethers'
import { createTransactionService, TransactionService } from './services'

const args = process.argv.slice(2)
const addressArg = args.find(arg => arg.startsWith('--address='))

if (!addressArg) {
  console.error(
    '❌ Please provide an Ethereum address using "npm run start -- --address="'
  )
  process.exit(1)
}

const registerUncaughtHandlers = (transactionService: TransactionService) => {
  process.on('uncaughtException', async (err: Error) => {
    console.error('CAUGHT UNCAUGHT!')
    console.error(err)
    await transactionService.queueService.close()
    process.exit(1)
  })

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('🚨 Unhandled Promise Rejection:', reason)
    await transactionService.queueService.close()
    process.exit(1)
  })
}

;(async () => {
  try {
    const address = addressArg.split('=')[1]
    if (!isAddress(address)) {
      throw new Error('❌ Invalid Address entered!')
    }

    // awaiting constructor call so that workers get deployed first
    const transactionService = await createTransactionService(address)
    registerUncaughtHandlers(transactionService)
    await transactionService.init()
  } catch (error) {
    console.error('Error in main execution:', error)
    process.exit(1)
  }
})()
