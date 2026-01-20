/**
 * Analytics Service Tests
 * 
 * Tests for analytics calculations (rolling returns, drawdown, CAGR).
 * Includes manual verification with known data.
 */

import {
  calculatePercentile,
  calculateMedian,
  calculateCAGR,
  calculateReturn,
  calculateMaxDrawdown,
} from '../src/services/analyticsService.js';

describe('Analytics Calculations', () => {
  describe('calculateReturn', () => {
    it('should calculate simple return correctly', () => {
      const startNav = 100;
      const endNav = 120;
      
      const result = calculateReturn(startNav, endNav);
      
      expect(result).toBeCloseTo(0.2, 4); // 20% return
    });

    it('should handle negative returns', () => {
      const startNav = 100;
      const endNav = 80;
      
      const result = calculateReturn(startNav, endNav);
      
      expect(result).toBeCloseTo(-0.2, 4); // -20% return
    });

    it('should return null for zero starting NAV', () => {
      const result = calculateReturn(0, 100);
      expect(result).toBeNull();
    });
  });

  describe('calculateCAGR', () => {
    it('should calculate CAGR correctly for 1 year', () => {
      const startNav = 100;
      const endNav = 115;
      const years = 1;
      
      const result = calculateCAGR(startNav, endNav, years);
      
      expect(result).toBeCloseTo(0.15, 4); // 15% CAGR
    });

    it('should calculate CAGR correctly for 3 years', () => {
      const startNav = 100;
      const endNav = 133.1; // ~10% CAGR compounded
      const years = 3;
      
      const result = calculateCAGR(startNav, endNav, years);
      
      expect(result).toBeCloseTo(0.10, 2); // ~10% CAGR
    });

    it('should calculate CAGR correctly for 5 years doubling', () => {
      const startNav = 100;
      const endNav = 200;
      const years = 5;
      
      const result = calculateCAGR(startNav, endNav, years);
      
      // Formula: (200/100)^(1/5) - 1 = 0.1487 (~14.87%)
      expect(result).toBeCloseTo(0.1487, 3);
    });

    it('should handle negative CAGR (loss)', () => {
      const startNav = 100;
      const endNav = 80;
      const years = 2;
      
      const result = calculateCAGR(startNav, endNav, years);
      
      expect(result).toBeLessThan(0);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('should calculate max drawdown correctly', () => {
      const navHistory = [
        { date: '2023-01-01', nav: 100 },
        { date: '2023-01-02', nav: 110 }, // Peak
        { date: '2023-01-03', nav: 95 },  // Drop
        { date: '2023-01-04', nav: 88 },  // Trough (20% from peak)
        { date: '2023-01-05', nav: 105 },
      ];
      
      const result = calculateMaxDrawdown(navHistory);
      
      // Max drawdown: (88 - 110) / 110 = -0.2 (-20%)
      expect(result).toBeCloseTo(-0.2, 2);
    });

    it('should return 0 for constantly rising NAV', () => {
      const navHistory = [
        { date: '2023-01-01', nav: 100 },
        { date: '2023-01-02', nav: 105 },
        { date: '2023-01-03', nav: 110 },
        { date: '2023-01-04', nav: 115 },
      ];
      
      const result = calculateMaxDrawdown(navHistory);
      
      expect(result).toBe(0);
    });

    it('should handle multiple drawdown periods', () => {
      const navHistory = [
        { date: '2023-01-01', nav: 100 },
        { date: '2023-01-02', nav: 90 },  // -10%
        { date: '2023-01-03', nav: 95 },
        { date: '2023-01-04', nav: 110 }, // New peak
        { date: '2023-01-05', nav: 77 },  // -30% from peak (worst)
        { date: '2023-01-06', nav: 100 },
      ];
      
      const result = calculateMaxDrawdown(navHistory);
      
      // Worst drawdown: (77 - 110) / 110 = -0.3 (-30%)
      expect(result).toBeCloseTo(-0.3, 2);
    });
  });

  describe('calculatePercentile', () => {
    it('should calculate median (50th percentile) correctly', () => {
      const sorted = [10, 20, 30, 40, 50];
      
      const result = calculatePercentile(sorted, 50);
      
      expect(result).toBe(30);
    });

    it('should calculate 25th percentile correctly', () => {
      const sorted = [10, 20, 30, 40, 50];
      
      const result = calculatePercentile(sorted, 25);
      
      expect(result).toBe(20);
    });

    it('should calculate 75th percentile correctly', () => {
      const sorted = [10, 20, 30, 40, 50];
      
      const result = calculatePercentile(sorted, 75);
      
      expect(result).toBe(40);
    });

    it('should handle interpolation for non-exact percentiles', () => {
      const sorted = [10, 20, 30, 40];
      
      const result = calculatePercentile(sorted, 50);
      
      expect(result).toBe(25); // Interpolation between 20 and 30
    });

    it('should return null for empty array', () => {
      const result = calculatePercentile([], 50);
      expect(result).toBeNull();
    });
  });

  describe('calculateMedian', () => {
    it('should calculate median for odd-length array', () => {
      const arr = [5, 2, 8, 1, 9];
      
      const result = calculateMedian(arr);
      
      expect(result).toBe(5);
    });

    it('should calculate median for even-length array', () => {
      const arr = [1, 2, 3, 4];
      
      const result = calculateMedian(arr);
      
      expect(result).toBe(2.5);
    });
  });
});

describe('Manual Verification Examples', () => {
  describe('Rolling Returns Calculation', () => {
    it('should match manually calculated 1-year return', () => {
      // NAV on 2023-01-01: 100
      // NAV on 2024-01-01: 115
      // 1-year return = (115 - 100) / 100 = 0.15 (15%)
      
      const startNav = 100;
      const endNav = 115;
      
      const returnValue = calculateReturn(startNav, endNav);
      
      expect(returnValue).toBeCloseTo(0.15, 4);
      expect(returnValue * 100).toBeCloseTo(15, 2); // 15%
    });
  });

  describe('CAGR Verification', () => {
    it('should verify 3-year CAGR calculation', () => {
      // Initial: 100, Final after 3 years: 146.41 (10% CAGR)
      // CAGR = (146.41/100)^(1/3) - 1 = 0.1346... ≈ 13.5%
      
      const result = calculateCAGR(100, 146.41, 3);
      
      // (1.4641)^(1/3) - 1 ≈ 0.135
      expect(result * 100).toBeCloseTo(13.5, 0);
    });
  });
});
