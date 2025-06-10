import * as fs from 'fs'
import path from 'path'
import { Parser } from '@json2csv/plainjs'
import { CSV_FOLDER_PATH } from '../config'
let fileCount = 1

export const delay = (ms: number) => {
  return new Promise(res => setTimeout(res, ms))
}

export async function retry<T>(
  fn: () => Promise<T>,
  retries: number = 5,
  delayMs: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      console.warn(`Attempt ${attempt} failed: ${(err as Error).message}`)

      if (attempt < retries) {
        const backoff = delayMs * attempt
        await delay(backoff)
      } else {
        throw new Error(
          `Failed after ${retries} attempts: ${(err as Error).message}`
        )
      }
    }
  }
  throw new Error('Unexpected flow in retry()')
}

export async function writeToCSV(address: string, data: any[]): Promise<void> {
  if (!fs.existsSync(CSV_FOLDER_PATH)) {
    fs.mkdirSync(CSV_FOLDER_PATH)
  }
  console.info(`Generating CSV...⌛️`)
  const csv = new Parser().parse(data)
  const filename = path.join(
    CSV_FOLDER_PATH,
    `address_${address}_batch_${fileCount}.csv`
  )
  fs.writeFileSync(filename, csv)
  fileCount++
  console.log(`✅ CSV Created for ${address} @ ${filename}`)
}

/**
 * A generic mutex implementation using a binary semaphore
 * @param mutex - An object containing the mutex flag that can be passed by reference
 * @param operation - The async operation to perform under mutex protection
 * @returns The result of the operation
 */
export async function withMutex<T>(
  mutex: { value: boolean },
  operation: () => Promise<T>
): Promise<T> {
  while (mutex.value) {
    await delay(1000) // Wait if mutex is locked
  }
  mutex.value = true
  try {
    return await operation()
  } finally {
    mutex.value = false
  }
}
