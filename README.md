# Transaction Aggregator

A TypeScript application that fetches and processes Ethereum wallet transactions using the Alchemy SDK. The application retrieves both incoming and outgoing transactions, processes them in batches, and exports the data to CSV file(s).

## Features

- Fetches both incoming and outgoing transactions for any Ethereum address
- Handles pagination for large transaction histories
- Processes transactions in batches to manage memory usage
- Calculates gas fees for each transaction
- Exports processed data to CSV files
- Comprehensive test coverage using Jest

## Prerequisites

- Node.js (v18 or higher)
- npm (v6 or higher)
- An Alchemy API key (login to get one [Alchemy](https://auth.alchemy.com/))

## Setup

1. Clone the repository:

```bash
git clone https://github.com/achal-singh/Transaction-Aggregator.git
cd Transaction-Aggregator
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file in the root directory and add your Alchemy API key:

```bash
ALCHEMY_API_KEY=your_api_key_here
```

## Project Structure

```
├── src/
│   ├── config/         # Configuration settings
│   ├── services/       # Core business logic
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   └── index.ts        # Entry point
├── src/__tests__/      # Test files
├── csv/               # Output directory for CSV files
├── jest.config.js     # Jest configuration
└── tsconfig.json      # TypeScript configuration
```

## Usage

To fetch transactions for an Ethereum address:

```bash
npm run start -- --address=0xYourEthereumAddress
```

The application will:

1. Fetch all transactions for the given address.
2. Process them in batches of 1000, sub-batches of 300.
3. Generate CSV files for every **`1000`** transactions in the `csv/` directory.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate test coverage report
npm run test:coverage
```

## How It Works

### 1. Initialization

- The application starts by validating the provided Ethereum address
- Creates an instance of `TransactionService` which initializes the Alchemy SDK

### 2. Transaction Fetching

- The service fetches both incoming and outgoing transactions linked to the wallet address using Alchemy's `getAssetTransfers` function call.
- Handles pagination automatically if there are more than 1000 transactions using the `pageKey` in the response.
- Transactions are stored in memory in two batches: `incomingTxs` and `outgoingTxs`.

### 3. Processing

- To not overwhelm the memory a CSV file is generated for every 1000 transactions.

  - The transaction fees of 300 Transactions are fetched at a time to avoid memory overflows. This is done via `getTransactionReceipt` call since fee details are not returned in the `getAssetTransfers` call by default.

- With fees and other essential data, the transactions are written to CSV files.

### 4. CSV Generation

- Processed transactions are written to CSV files.
- Each batch of 1000 transactions gets its own CSV file
- CSV files are named in this pattern: `address_<address>_batch_<number>.csv`

## Dependencies

- `alchemy-sdk`: For interacting with the Alchemy API
- `ethers`: For Ethereum-related utilities
- `@json2csv/plainjs`: For CSV generation
- `jest`: For testing
