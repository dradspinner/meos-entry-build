// MeOS API Proxy Plugin for Vite
// Provides custom API endpoints for live results integration

import fetch from 'node-fetch';

export function createMeosApiProxy() {
  return {
    name: 'meos-api-proxy',
    configureServer(server) {
      // Add custom API routes
      server.middlewares.use('/api/meos/live-runners', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            
            // Try multiple MeOS API endpoints to get live runner data
            const meosEndpoints = [
              'http://localhost:2009/meos?get=competitors',
              'http://localhost:2009/meos?get=startlist',
              'http://localhost:2009/meos?get=results',
              'http://localhost:2009/meos?get=entries',
              'http://localhost:2009/meos?list=competitors',
            ];

            let runners = [];
            
            for (const endpoint of meosEndpoints) {
              try {
                const response = await fetch(endpoint, { timeout: 3000 });
                
                if (response.ok) {
                  const xmlText = await response.text();
                  // Parse XML and extract runner data
                  const extractedRunners = parseXmlResponse(xmlText);
                  
                  if (extractedRunners && extractedRunners.length > 0) {
                    runners = extractedRunners;
                    break;
                  }
                }
              } catch (endpointError) {
                continue;
              }
            }

            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
            res.setHeader('Content-Type', 'application/json');
            
            // Return the runner data
            res.end(JSON.stringify(runners));
            
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to fetch live runner data' }));
          }
        } else {
          next();
        }
      });

      // Add entries endpoint (existing functionality)
      server.middlewares.use('/api/meos/entries', async (req, res, next) => {
        if (req.method === 'GET') {
          try {
            
            // Try the getAllEntries method equivalent
            const response = await fetch('http://localhost:2009/meos?get=entries', { timeout: 5000 });
            
            if (response.ok) {
              const xmlText = await response.text();
              const entries = parseXmlResponse(xmlText) || [];
              
              // Set CORS headers
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              res.setHeader('Content-Type', 'application/json');
              
              res.end(JSON.stringify(entries));
            } else {
              throw new Error(`MeOS API returned ${response.status}`);
            }
          } catch (error) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Failed to fetch entry data' }));
          }
        } else {
          next();
        }
      });

      // Handle OPTIONS requests for CORS preflight
      server.middlewares.use('/api/meos/*', (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 200;
          res.end();
        } else {
          next();
        }
      });
    }
  };
}

// Parse XML response and extract runner data
function parseXmlResponse(xmlText) {
  try {
    // Simple XML parsing - in production, you might want to use a proper XML parser
    const runners = [];
    
    // For now, return mock data to test the integration
    // In a real implementation, this would parse the actual MeOS XML
    return [
      {
        id: 'live_1',
        name: { first: 'Test', last: 'Runner' },
        fullName: 'Test Runner',
        club: 'Live OC',
        cardNumber: '12345',
        className: 'Blue',
        classId: '1',
        status: 'checked_in',
        dataSource: 'meos_api'
      },
      {
        id: 'live_2', 
        name: { first: 'Another', last: 'Competitor' },
        fullName: 'Another Competitor',
        club: 'Event OC',
        cardNumber: '67890',
        className: 'Red',
        classId: '2',
        status: 'in_forest',
        startTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // Started 10 minutes ago
        dataSource: 'meos_api'
      }
    ];
  } catch (error) {
    return [];
  }
}