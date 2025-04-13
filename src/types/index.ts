export interface Transaction {
  transactionHash: string;
  from: string;
  to: string;
  value: number;
  asset_symbol: string;
  tx_type: string;
  gasFeeEth: string;
  asset_address: string | null;
  nft_tokenId: string | null;
  timestamp: string;
}

export interface FetchAllTransactionsParams {
  address: string;
  nextPageForIncoming?: boolean;
  nextPageForOutgoing?: boolean;
  _pageKey?: string;
}

export interface AssetTransfersParams {
  address: string;
  direction: 'incoming' | 'outgoing';
  pageKey?: string;
}

export interface TransactionBatch {
  transfers: any[];
  pageKey: string | null;
} 