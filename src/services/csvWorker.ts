import { SandboxedJob } from 'bullmq'
import { writeToCSV } from '../utils'

module.exports = async (job: SandboxedJob): Promise<void> => {
  const { address, transactions: txs } = job.data
  try {
    console.info(
      `\n\n⛏️ CSV Worker: Writing ${txs.length} transactions to CSV for ${address}`
    )
    await writeToCSV(address, txs)
    console.info(`✅ CSV published for ${txs.length} transactions.`)
  } catch (error) {
    console.error(`❌ CSV Worker: Error while writing CSV`)
    console.error(error)
    throw error
  }
}
