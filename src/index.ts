import * as dotenv from 'dotenv'
dotenv.config()
import { isAddress } from 'ethers'
import { TransactionService } from './services'

const args = process.argv.slice(2)
const addressArg = args.find(arg => arg.startsWith('--address='))

if (!addressArg) {
  console.error(
    '❌ Please provide an Ethereum address using "npm run start -- --address="'
  )
  process.exit(1)
}

;(async () => {
  try {
    if (!isAddress(addressArg.split('=')[1]))
      throw new Error('❌ Invalid Address entered!')

    const transactionService = new TransactionService()

    await transactionService.init({ address: addressArg.split('=')[1] })
  } catch (error) {
    console.error('Error in main execution:', error)
    process.exit(1)
  }
})()
