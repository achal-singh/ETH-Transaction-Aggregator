import path from 'path'
import { EventEmitter } from 'events'
import { Queue, Worker, Job } from 'bullmq'
import { ProcessedTransaction } from '../types'
import { withMutex } from '../utils'
import { REDIS_CONFIG, BATCH_SIZE, MAX_RECEIPT_WORKERS } from '../config'

interface ProcessJobData {
  address: string
  transactions: any[]
}

export class QueueService extends EventEmitter {
  sampleMap: Map<string, string> = new Map()
  walletAddress = ''
  private csvCounter = 0
  private csvQueue: Queue | undefined
  private receiptQueue: Queue | undefined
  private receiptWorkers: Worker[] = []
  private csvWorker: Worker | undefined
  private jobsCreated: number
  private jobsCompleted: number
  private processedTxOutput: ProcessedTransaction[] = []
  private mutex = { value: false }
  private isProcessing: boolean = false

  constructor() {
    super()
    this.jobsCreated = 0
    this.jobsCompleted = 0
  }

  async init(name: string) {
    try {
      this.receiptQueue = new Queue(name, {
        connection: REDIS_CONFIG
      })
      this.receiptQueue.on('error', err => {
        // Most likely a redis related error
        console.error(`Receipt Queue Error: ${err.name}`, err)
        process.exit(1)
      })
      await this.receiptQueue.waitUntilReady()

      this.setupReceiptWorkersAndHandlers()

      this.csvQueue = new Queue('CSV_Q')
      this.csvWorker = new Worker(
        this.csvQueue.name,
        path.join(__dirname, 'csvWorker.js'),
        {
          connection: REDIS_CONFIG,
          concurrency: 1
        }
      )
      this.initialiseErrorHandlers()
      this.setupCSVWorkerHandlers(this.csvWorker)

      this.setupSignalHandlers()
    } catch (error) {
      console.log('Error Caught!')
      console.error(error)
    }
  }

  initialiseErrorHandlers() {
    this.csvWorker!.on('error', err => {
      console.log('CAUGHT!')
      console.error('CSV Worker Redis error:', err.message)
      process.exit(1)
    })

    this.csvQueue!.on('error', err => {
      console.error('CSV Queue Redis error:', err.message)
    })
  }

  setupSignalHandlers() {
    const shutdown = async () => {
      console.info(
        '🛑 Received shutdown signal. Closing workers and queue gracefully...'
      )
      // Only create CSV if we have data and are in processing state
      if (this.processedTxOutput.length > 0 && this.isProcessing) {
        console.info(`Creating CSV with ${this.processedTxOutput.length} txs.`)
        await this.invokeCSVWorker()
      }
      await this.close()
      console.info('✅ Shutdown complete.')
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }

  private setupReceiptWorkersAndHandlers() {
    // Setup receipt workers
    const setupReceiptWorkerHandlers = (worker: Worker) => {
      worker.on('failed', (job, error) => {
        console.error(`Receipt Worker failed during operation`)
        console.error(error)
      })

      worker.on('completed', async (job: Job, processedTx: any[]) => {
        await withMutex(this.mutex, async () => {
          if (processedTx && processedTx.length) {
            this.processedTxOutput.push(...processedTx)
            this.jobsCompleted++
          }
          console.info(
            `✅ Job: ${job.name} Completed Successfully!. ${this.jobsCompleted} / ${this.jobsCreated} Completed!`
          )
          if (this.jobsCompleted === this.jobsCreated && this.isProcessing) {
            console.info(`\nAll Receipt-Jobs Completed.`)
            // Only invoke CSV worker if we have processed transactions
            if (this.processedTxOutput.length > 0) {
              await this.invokeCSVWorker()
            } else {
              console.info('No transactions to write to CSV.')
              this.isProcessing = false
              this.emit('allJobsDone')
            }
          }
        })
      })
    }

    // Create receipt workers
    for (let i = 0; i < MAX_RECEIPT_WORKERS; i++) {
      const worker = new Worker(
        this.receiptQueue!.name,
        path.join(__dirname, 'receiptWorker.js'),
        {
          connection: REDIS_CONFIG,
          concurrency: 1,
          removeOnFail: { count: 10 },
          removeOnComplete: { count: 10 }
        }
      )
      setupReceiptWorkerHandlers(worker)
      this.receiptWorkers.push(worker)
    }
  }

  private setupCSVWorkerHandlers = (worker: Worker) => {
    worker.on('failed', (job, error) => {
      console.error(`CSV Job: ${job!.name} failed during operation`)
      console.error(error)
    })

    worker.on('completed', job => {
      console.info(`✅ CSV Job: ${job.name} Completed Successfully!`)
      this.emit('allJobsDone')
    })
  }

  async addReceiptJob({ address, transactions }: ProcessJobData) {
    if (!transactions || transactions.length === 0) {
      console.info('No transactions to process.')
      return
    }

    this.walletAddress = address
    this.isProcessing = true
    const bulkJobs = []
    console.info(`Processing ${transactions.length} of ${address}...⌛️`)
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const chunk = transactions.slice(i, i + BATCH_SIZE)
      bulkJobs.push({
        name: `TXS-${i}-${i + BATCH_SIZE}`,
        data: { address, transactions: chunk },
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
          removeOnFail: true,
          deduplication: { id: `TXS-${i}-${i + BATCH_SIZE}` }
        }
      })
    }
    await this.receiptQueue!.addBulk(bulkJobs)
    this.jobsCreated = this.jobsCreated + bulkJobs.length
    console.info(`\n 💼 ${bulkJobs.length} Jobs created.`)
  }

  private async invokeCSVWorker(): Promise<void> {
    if (!this.processedTxOutput || this.processedTxOutput.length === 0) {
      console.info('No transactions to write to CSV.')
      return
    }

    await this.csvQueue!.add(
      `CSV-${this.walletAddress}-${this.csvCounter}`,
      {
        address: this.walletAddress,
        transactions: this.processedTxOutput
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    )
    this.csvCounter += 1
    this.isProcessing = false
    this.processedTxOutput = []
    this.jobsCreated = 0
    this.jobsCompleted = 0
  }

  async close() {
    await withMutex(this.mutex, async () => {
      this.isProcessing = false
      this.processedTxOutput = []
      await this.receiptQueue!.drain()
      await this.csvQueue!.drain()
      await Promise.all([...this.receiptWorkers.map(worker => worker.close())])
      await this.csvWorker!.close()
      await this.receiptQueue!.close()
      await this.csvQueue!.close()
    })
  }
}
