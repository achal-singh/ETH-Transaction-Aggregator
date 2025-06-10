import path from 'path'
import { Network } from 'alchemy-sdk'

export const CSV_FOLDER_PATH = path.join(process.cwd(), 'csv')

if (!process.env.ALCHEMY_API_KEY)
  throw new Error('Missing required environment variable: ALCHEMY_API_KEY')

export const ALCHEMY_CONFIG = {
  network: Network.ETH_MAINNET,
  apiKey: process.env.ALCHEMY_API_KEY
} as const

export const EXCLUDE_ZERO_VALUE_TXS = parseInt(
  process.env.EXCLUDE_ZERO_VALUE_TXS || '1'
) as number

export const ORDER = parseInt(process.env.LATEST_TX_FIRST || '0')

// The number of receipt fetching workers (child processes) to be deployed.
export const MAX_RECEIPT_WORKERS = isNaN(
  Number(process.env.MAX_RECEIPT_WORKERS)
)
  ? 3
  : Number(process.env.MAX_RECEIPT_WORKERS)

export const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: isNaN(Number(process.env.REDIS_PORT))
    ? 6379
    : Number(process.env.REDIS_PORT)
}

export const BATCH_SIZE = isNaN(Number(process.env.BATCH_SIZE))
  ? 50
  : Number(process.env.BATCH_SIZE)

export const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 1000
} as const
