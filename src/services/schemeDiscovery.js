/**
 * Scheme Discovery Service
 * 
 * Discovers mutual fund schemes matching the configured filters:
 * - AMCs: ICICI Prudential, HDFC, Axis, SBI, Kotak Mahindra
 * - Categories: Mid Cap Direct Growth, Small Cap Direct Growth
 * 
 * Uses fuzzy matching to handle variations in naming conventions.
 */

import config from '../config/index.js';
import { logger } from '../logger/index.js';
import * as mfApiClient from './mfApiClient.js';

/**
 * Filters schemes based on configured AMC and category criteria
 * 
 * @param {Array} schemes - Array of schemes from API
 * @param {Object} filters - Filter configuration {amcs, categories, mustInclude}
 * @returns {Array} Filtered schemes
 */
function filterSchemes(schemes, filters) {
  const { amcs, categories, mustInclude } = filters;
  
  return schemes.filter(scheme => {
    const name = scheme.schemeName?.toLowerCase() || '';
    
    // Check AMC match (scheme name usually contains AMC name)
    const matchesAmc = amcs.some(amc => 
      name.includes(amc.toLowerCase())
    );
    
    if (!matchesAmc) return false;
    
    // Check category match
    const matchesCategory = categories.some(cat => 
      name.includes(cat.toLowerCase())
    );
    
    if (!matchesCategory) return false;
    
    // Check must include terms (Direct, Growth)
    const matchesMustInclude = mustInclude.every(term => 
      name.includes(term.toLowerCase())
    );
    
    return matchesMustInclude;
  });
}

/**
 * Categorizes a scheme based on its name
 * Extracts AMC and category information
 * 
 * @param {Object} scheme - Scheme object with schemeName
 * @returns {Object} Categorized scheme with amc and category fields
 */
function categorizeScheme(scheme) {
  const name = scheme.schemeName?.toLowerCase() || '';
  const { amcs, categories } = config.schemeFilters;
  
  // Find matching AMC
  let amc = 'Unknown';
  for (const amcName of amcs) {
    if (name.includes(amcName.toLowerCase())) {
      amc = amcName;
      break;
    }
  }
  
  // Find matching category
  let category = 'Unknown';
  if (name.includes('mid cap')) {
    category = 'Mid Cap Direct Growth';
  } else if (name.includes('small cap')) {
    category = 'Small Cap Direct Growth';
  }
  
  return {
    ...scheme,
    amc,
    category,
  };
}

/**
 * Discovers schemes matching the configured filters
 * 
 * Process:
 * 1. Fetch all schemes from mfapi.in
 * 2. Filter by AMC and category
 * 3. Categorize each matching scheme
 * 
 * @param {string} requestId - Request ID for tracing
 * @returns {Promise<Array>} Array of matching schemes
 */
async function discoverSchemes(requestId = 'scheme-discovery') {
  const startTime = Date.now();
  
  logger.info('Starting scheme discovery', {
    request_id: requestId,
    amcs: config.schemeFilters.amcs,
    categories: config.schemeFilters.categories,
  });

  try {
    // Fetch all schemes
    const allSchemes = await mfApiClient.getAllSchemes(requestId);
    
    logger.info('Total schemes fetched', {
      request_id: requestId,
      total: allSchemes.length,
    });

    // Filter schemes
    const matchingSchemes = filterSchemes(allSchemes, config.schemeFilters);
    
    // Categorize each scheme
    const categorizedSchemes = matchingSchemes.map(scheme => ({
      schemeCode: String(scheme.schemeCode),
      schemeName: scheme.schemeName,
      ...categorizeScheme(scheme),
    }));

    const duration = Date.now() - startTime;
    
    // Log discovery results by category
    const byCategory = categorizedSchemes.reduce((acc, scheme) => {
      acc[scheme.category] = (acc[scheme.category] || 0) + 1;
      return acc;
    }, {});

    const byAmc = categorizedSchemes.reduce((acc, scheme) => {
      acc[scheme.amc] = (acc[scheme.amc] || 0) + 1;
      return acc;
    }, {});

    logger.info('Scheme discovery completed', {
      request_id: requestId,
      total_matched: categorizedSchemes.length,
      by_category: byCategory,
      by_amc: byAmc,
      duration_ms: duration,
    });

    return categorizedSchemes;
  } catch (error) {
    logger.error('Scheme discovery failed', {
      request_id: requestId,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Gets schemes grouped by category
 * 
 * @param {Array} schemes - Array of categorized schemes
 * @returns {Object} Schemes grouped by category
 */
function groupByCategory(schemes) {
  return schemes.reduce((acc, scheme) => {
    if (!acc[scheme.category]) {
      acc[scheme.category] = [];
    }
    acc[scheme.category].push(scheme);
    return acc;
  }, {});
}

/**
 * Gets schemes grouped by AMC
 * 
 * @param {Array} schemes - Array of categorized schemes
 * @returns {Object} Schemes grouped by AMC
 */
function groupByAmc(schemes) {
  return schemes.reduce((acc, scheme) => {
    if (!acc[scheme.amc]) {
      acc[scheme.amc] = [];
    }
    acc[scheme.amc].push(scheme);
    return acc;
  }, {});
}

export {
  discoverSchemes,
  filterSchemes,
  categorizeScheme,
  groupByCategory,
  groupByAmc,
};
