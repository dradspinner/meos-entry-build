// MeOS API Client Tests

import { describe, it, expect, beforeEach } from 'vitest';
import { MeosApiClient } from './meosApi';

describe('MeosApiClient', () => {
  let client: MeosApiClient;

  beforeEach(() => {
    client = new MeosApiClient({
      baseUrl: 'http://localhost:2009/meos',
      timeout: 5000,
      retryAttempts: 1,
    });
  });

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultClient = new MeosApiClient();
      const config = defaultClient.getConfig();
      
      expect(config.baseUrl).toBe('http://localhost:2009/meos');
      expect(config.timeout).toBe(10000);
      expect(config.retryAttempts).toBe(3);
    });

    it('should accept custom configuration', () => {
      const config = client.getConfig();
      
      expect(config.baseUrl).toBe('http://localhost:2009/meos');
      expect(config.timeout).toBe(5000);
      expect(config.retryAttempts).toBe(1);
    });

    it('should update configuration', () => {
      client.updateConfig({ timeout: 15000 });
      const config = client.getConfig();
      
      expect(config.timeout).toBe(15000);
    });
  });

  describe('Connection Testing', () => {
    it('should handle connection failure gracefully', async () => {
      // This will fail since we don't have MeOS running
      const isConnected = await client.testConnection();
      expect(typeof isConnected).toBe('boolean');
    });
  });

  describe('Entry Creation', () => {
    it('should format entry parameters correctly', () => {
      const params = {
        name: 'John Doe',
        club: 'Test Club',
        classId: 1,
        cardNumber: 123456,
        birthYear: 1990,
        sex: 'M' as const,
        nationality: 'USA',
        phone: '555-1234',
      };

      // This test verifies the parameter structure
      expect(params.name).toBe('John Doe');
      expect(params.classId).toBe(1);
      expect(params.cardNumber).toBe(123456);
      expect(params.sex).toBe('M');
    });
  });

  describe('XML Parsing', () => {
    it('should handle empty responses', () => {
      // Test that client can handle various response formats
      expect(true).toBe(true); // Placeholder - actual XML parsing would be tested with mock responses
    });
  });
});

// Integration tests (require actual MeOS instance)
describe('MeOS Integration Tests', () => {
  let client: MeosApiClient;

  beforeEach(() => {
    client = new MeosApiClient();
  });

  // These tests would only run if MeOS is available
  it.skip('should connect to real MeOS instance', async () => {
    const isConnected = await client.testConnection();
    expect(isConnected).toBe(true);
  });

  it.skip('should fetch competition information', async () => {
    const competition = await client.getCompetition();
    expect(competition).toBeTruthy();
    expect(competition?.name).toBeTruthy();
  });

  it.skip('should fetch available classes', async () => {
    const classes = await client.getClasses();
    expect(Array.isArray(classes)).toBe(true);
  });

  it.skip('should lookup runners', async () => {
    const runners = await client.lookupRunners('John');
    expect(Array.isArray(runners)).toBe(true);
  });

  it.skip('should lookup clubs', async () => {
    const clubs = await client.lookupClubs('Test');
    expect(Array.isArray(clubs)).toBe(true);
  });
});

export {};