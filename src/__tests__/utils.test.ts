import { delay, retry, writeToCSV } from '../utils';
import * as fs from 'fs';
import { Parser } from '@json2csv/plainjs';

// Mock fs and Parser
jest.mock('fs');
jest.mock('@json2csv/plainjs');

describe('Utility Functions', () => {
  describe('delay', () => {
    it('should wait for the specified time', async () => {
      const start = Date.now();
      await delay(100);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(100);
    });
  });

  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const result = await retry(mockFn);
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce('success');

      const result = await retry(mockFn, 3);
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Always fails'));
      await expect(retry(mockFn, 2)).rejects.toThrow('Failed after 2 attempts: Always fails');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('writeToCSV', () => {
    const mockData = [
      { id: 1, name: 'Test' },
      { id: 2, name: 'Test2' }
    ];

    beforeEach(() => {
      jest.clearAllMocks();
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {});
      (Parser.prototype.parse as jest.Mock).mockReturnValue('csv,data');
    });

    it('should create directory if it does not exist', async () => {
      await writeToCSV('0x123', mockData);
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should write CSV file with correct data', async () => {
      await writeToCSV('0x123', mockData);
      expect(Parser.prototype.parse).toHaveBeenCalledWith(mockData);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      (fs.writeFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('Write failed');
      });
      await expect(writeToCSV('0x123', mockData)).rejects.toThrow('Write failed');
    });
  });
}); 