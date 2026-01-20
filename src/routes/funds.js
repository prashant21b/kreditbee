/**
 * Funds Router
 * 
 * Handles all fund-related API endpoints:
 * - GET /funds - List all funds
 * - GET /funds/rank - Rank funds by metrics
 * - GET /funds/:code - Get fund details with latest NAV
 * - GET /funds/:code/analytics - Get precomputed analytics
 */

import { Router } from 'express';
import * as fundService from '../services/fundService.js';
import { fundsDao, navHistoryDao, analyticsDao } from '../dao/index.js';

const router = Router();

/**
 * GET /funds/rank
 * 
 * Ranks funds within a category by performance metrics.
 * Returns response in the exact format specified in requirements.
 */
router.get('/rank', async (req, res, next) => {
  try {
    const { category, sort_by = 'median_return', window, limit = 5 } = req.query;

    // Validate required parameters
    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'category is required',
      });
    }

    if (!window) {
      return res.status(400).json({
        success: false,
        error: 'window is required (1Y, 3Y, 5Y, 10Y)',
      });
    }

    const validWindows = ['1Y', '3Y', '5Y', '10Y'];
    if (!validWindows.includes(window)) {
      return res.status(400).json({
        success: false,
        error: `Invalid window. Must be one of: ${validWindows.join(', ')}`,
      });
    }

    req.logger.info('Ranking funds', {
      category,
      sort_by,
      window,
      limit,
    });

    const ranked = await fundService.rankFunds({
      category,
      sortBy: sort_by,
      window,
      limit: parseInt(limit, 10),
    });

    // Get total count for the category
    const allFunds = await fundService.getFunds({ category });

    // Format response as per requirements
    const formattedFunds = ranked.map((fund, index) => ({
      rank: index + 1,
      fund_code: fund.scheme_code,
      fund_name: fund.scheme_name,
      amc: fund.amc,
      [`median_return_${window.toLowerCase()}`]: fund.rolling_return_median 
        ? parseFloat((parseFloat(fund.rolling_return_median) * 100).toFixed(1)) 
        : null,
      [`max_drawdown_${window.toLowerCase()}`]: fund.max_drawdown 
        ? parseFloat((parseFloat(fund.max_drawdown) * 100).toFixed(1)) 
        : null,
      current_nav: fund.latest_nav || null,
      last_updated: fund.latest_nav_date || null,
    }));

    res.json({
      category: category,
      window: window,
      sorted_by: sort_by,
      total_funds: allFunds.length,
      showing: formattedFunds.length,
      funds: formattedFunds,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /funds
 * 
 * Lists all funds with optional filtering.
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, amc } = req.query;

    req.logger.info('Fetching funds', { category, amc });

    const funds = await fundService.getFunds({ category, amc });

    res.json({
      success: true,
      count: funds.length,
      data: funds,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /funds/:code
 * 
 * Gets fund details with latest NAV.
 */
router.get('/:code', async (req, res, next) => {
  try {
    const { code } = req.params;

    req.logger.info('Fetching fund details', { scheme_code: code });

    const fund = await fundService.getFundByCode(code);

    if (!fund) {
      return res.status(404).json({
        success: false,
        error: `Fund with code ${code} not found`,
      });
    }

    res.json({
      success: true,
      data: fund,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /funds/:code/analytics
 * 
 * Gets precomputed analytics for a fund.
 * Returns response in the exact format specified in requirements.
 */
router.get('/:code/analytics', async (req, res, next) => {
  try {
    const { code } = req.params;
    const { window } = req.query;

    // Window is required as per spec
    if (!window) {
      return res.status(400).json({
        success: false,
        error: 'window query parameter is required (1Y, 3Y, 5Y, 10Y)',
      });
    }

    const validWindows = ['1Y', '3Y', '5Y', '10Y'];
    if (!validWindows.includes(window)) {
      return res.status(400).json({
        success: false,
        error: `Invalid window. Must be one of: ${validWindows.join(', ')}`,
      });
    }

    req.logger.info('Fetching fund analytics', { scheme_code: code, window });

    // Get fund details
    const fund = await fundService.getFundByCode(code);
    if (!fund) {
      return res.status(404).json({
        success: false,
        error: `Fund with code ${code} not found`,
      });
    }

    // Get analytics for specific window
    const analytics = await fundService.getAnalytics(code, window);
    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: `Analytics for fund ${code} with window ${window} not found`,
      });
    }

    // Get NAV data stats
    const navHistory = await navHistoryDao.findAllByScheme(code);
    const navCount = navHistory.length;

    // Calculate rolling periods
    const windowDays = { '1Y': 365, '3Y': 1095, '5Y': 1825, '10Y': 3650 };
    const rollingPeriods = Math.max(0, navCount - windowDays[window]);

    // Format response as per requirements
    res.json({
      fund_code: code,
      fund_name: fund.scheme_name,
      category: fund.category,
      amc: fund.amc,
      window: window,
      data_availability: {
        start_date: analytics.data_start_date,
        end_date: analytics.data_end_date,
        total_days: navHistory.length > 0 
          ? Math.ceil((new Date(navHistory[navCount-1].date) - new Date(navHistory[0].date)) / (1000*60*60*24))
          : 0,
        nav_data_points: navCount,
      },
      rolling_periods_analyzed: rollingPeriods,
      rolling_returns: {
        min: analytics.rolling_return_min 
          ? parseFloat((parseFloat(analytics.rolling_return_min) * 100).toFixed(1)) 
          : null,
        max: analytics.rolling_return_max 
          ? parseFloat((parseFloat(analytics.rolling_return_max) * 100).toFixed(1)) 
          : null,
        median: analytics.rolling_return_median 
          ? parseFloat((parseFloat(analytics.rolling_return_median) * 100).toFixed(1)) 
          : null,
        p25: analytics.rolling_return_p25 
          ? parseFloat((parseFloat(analytics.rolling_return_p25) * 100).toFixed(1)) 
          : null,
        p75: analytics.rolling_return_p75 
          ? parseFloat((parseFloat(analytics.rolling_return_p75) * 100).toFixed(1)) 
          : null,
      },
      max_drawdown: analytics.max_drawdown 
        ? parseFloat((parseFloat(analytics.max_drawdown) * 100).toFixed(1)) 
        : null,
      cagr: {
        min: analytics.cagr_min 
          ? parseFloat((parseFloat(analytics.cagr_min) * 100).toFixed(1)) 
          : null,
        max: analytics.cagr_max 
          ? parseFloat((parseFloat(analytics.cagr_max) * 100).toFixed(1)) 
          : null,
        median: analytics.cagr_median 
          ? parseFloat((parseFloat(analytics.cagr_median) * 100).toFixed(1)) 
          : null,
      },
      computed_at: analytics.computed_at,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
