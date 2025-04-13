import path from 'path'
import { Network } from 'alchemy-sdk'

export const CSV_FOLDER_PATH = path.join(process.cwd(), 'csv')

export const ALCHEMY_CONFIG = {
  network: Network.ETH_MAINNET,
  apiKey: process.env.ALCHEMY_API_KEY
} as const

export const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 1000
} as const
