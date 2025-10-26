import React, { useState, useEffect, useCallback } from 'react';
import { Select, Typography } from 'antd';
import { meosApi } from '../services/meosApi';

const { Title } = Typography;

interface Runner {
  competitorId: string;
  place: number;
  name: string;
  club: string;
  time: string;
  timeMs: number;
  status: string;
  timeBehind: number | null;
  timeLost: number | null;
}

interface ResultsByClass {
  [className: string]: Runner[];
}

interface Competition {
  name: string;
  date: string;
}

const LiveResultsDisplay: React.FC = () => {
  const [resultsByClass, setResultsByClass] = useState<ResultsByClass>({});
  const [competition, setCompetition] = useState<Competition | null>(null);
  const [courseLengths, setCourseLengths] = useState<{ [key: string]: number }>({});
  const [classMap, setClassMap] = useState<{ [key: string]: string }>({});
  const [lastUpdate, setLastUpdate] = useState<string>('Loading...');
  const [dataStatus, setDataStatus] = useState<'loading' | 'online' | 'error'>('loading');
  const [refreshInterval, setRefreshInterval] = useState<number>(15);
  const [screenCount, setScreenCount] = useState<number>(1);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Load competition info
        const comp = await meosApi.getCompetition();
        setCompetition(comp);

        // Load class map and course lengths from API
        const classes = await meosApi.getAllClasses();
        const map: { [key: string]: string } = {};
        const lengths: { [key: string]: number } = {};
        
        for (const cls of classes) {
          map[cls.id] = cls.name;
          // Get course length if available
          if (cls.course?.length) {
            lengths[cls.name] = cls.course.length;
          }
        }
        
        setClassMap(map);
        setCourseLengths(lengths);

        console.log('✅ Initial data loaded');
      } catch (error) {
        console.error('❌ Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Fetch results
  const fetchResults = useCallback(async () => {
    try {
      console.log('🔄 Fetching results...');

      const resultsData = await meosApi.getResults({ preliminary: true });

      if (!resultsData || !resultsData.results) {
        throw new Error('No results data received');
      }

      const byClass = await parseResultsWithAnalysis(resultsData);
      setResultsByClass(byClass);
      setDataStatus('online');
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error('❌ Failed to fetch results:', error);
      setDataStatus('error');
      setLastUpdate(new Date().toLocaleTimeString());
    }
  }, [classMap]);

  // Auto-refresh
  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [fetchResults, refreshInterval]);

  const parseResultsWithAnalysis = async (resultsData: any): Promise<ResultsByClass> => {
    const results = resultsData.results;
    const persons = Array.isArray(results.person) ? results.person : (results.person ? [results.person] : []);

    const byClass: ResultsByClass = {};

    for (const person of persons) {
      const competitorId = person.name?.['@attributes']?.id;
      const classId = person['@attributes']?.cls;
      const className = getClassName(classId);

      if (!byClass[className]) {
        byClass[className] = [];
      }

      const name = person.name?.['#text'] || person.name || '';
      const club = person.org?.['#text'] || person.org || '';
      const place = parseInt(person['@attributes']?.place || '0');
      // rt is in deciseconds but appears to be 10x too large, divide by 10 then convert to ms
      const rtValue = parseInt(person['@attributes']?.rt || '0');
      const timeMs = (rtValue / 10) * 100; // = rtValue * 10
      const status = parseInt(person['@attributes']?.stat || '0');
      
      console.log(`⏱️ ${name}: rt=${rtValue}, timeMs=${timeMs}, formatted=${formatTime(timeMs)}`);

      const runner: Runner = {
        competitorId,
        place,
        name,
        club,
        time: formatTime(timeMs),
        timeMs: timeMs,
        status: status === 1 ? 'OK' : 'DNF',
        timeBehind: null,
        timeLost: null,
      };

      byClass[className].push(runner);
    }

    // Sort each class by place
    for (const className in byClass) {
      byClass[className].sort((a, b) => a.place - b.place);
    }

    // Fetch detailed split analysis
    await enrichWithSplitAnalysis(byClass);

    return byClass;
  };

  const enrichWithSplitAnalysis = async (resultsByClass: ResultsByClass) => {
    for (const className in resultsByClass) {
      const runners = resultsByClass[className];
      const finishedRunners = runners.filter(r => r.status === 'OK');

      console.log(`🔍 Fetching split analysis for ${finishedRunners.length} runners in ${className}...`);

      for (const runner of finishedRunners) {
        if (!runner.competitorId) {
          console.warn(`  ⚠️ ${runner.name} has no competitorId, skipping split analysis`);
          continue;
        }

        try {
          console.log(`  🔍 Fetching details for ${runner.name} (ID: ${runner.competitorId})...`);
          const details = await meosApi.lookupCompetitorById({
            id: parseInt(runner.competitorId)
          });

          if (details) {
            console.log(`  ✅ Got details for ${runner.name}:`, {
              hasSplits: !!details.splits,
              splitCount: details.splits?.length || 0,
              timeAfterMs: details.timeAfterMs
            });
            
            runner.timeBehind = details.timeAfterMs || 0;
            
            if (details.splits && details.splits.length > 0) {
              // Log split analysis data for debugging
              console.log(`  📊 Splits for ${runner.name}:`, details.splits.map((s: any, i: number) => ({
                control: i + 1,
                time: s.time,
                hasAnalysis: !!s.analysis,
                lost: s.analysis?.lost,
                behind: s.analysis?.behind,
                mistake: s.analysis?.mistake
              })));
              
              runner.timeLost = calculateTotalTimeLost(details.splits);
              console.log(`  🎯 Total lost time for ${runner.name}: ${runner.timeLost}ms (${formatTime(runner.timeLost)})`);
            } else {
              console.warn(`  ⚠️ ${runner.name} has no splits data`);
            }
          } else {
            console.warn(`  ⚠️ No details returned for ${runner.name}`);
          }
        } catch (error) {
          console.error(`  ❌ Failed to get analysis for ${runner.name}:`, error);
        }
      }
    }
  };

  /**
   * Calculate total lost time from split analysis
   * 
   * IMPORTANT: In MeOS C++ code and REST API:
   * - 'lost' attribute = time behind leg leader (after[ix])
   * - 'behind' attribute = accumulated time behind (afterAcc[ix])
   * - 'mistake' attribute = actual calculated lost/missed time (delta[ix] from getSplitAnalysis)
   * 
   * The total lost time is the sum of POSITIVE 'mistake' values, not 'lost' values.
   * This matches MeOS's getMissedTime() method which sums positive deltaTimes.
   */
  const calculateTotalTimeLost = (splits: any[]): number => {
    if (!splits || splits.length === 0) {
      console.log('    ⚠️ calculateTotalTimeLost: No splits provided');
      return 0;
    }

    let totalLost = 0;
    let mistakesFound = 0;
    
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      if (split.analysis && split.analysis.mistake) {
        const lostMs = parseTimeString(split.analysis.mistake);
        console.log(`    📌 Split ${i + 1}: mistake="${split.analysis.mistake}" = ${lostMs}ms`);
        // Only count positive lost time (as per MeOS getMissedTime logic)
        if (lostMs > 0) {
          totalLost += lostMs;
          mistakesFound++;
        }
      }
    }
    
    console.log(`    ✅ Found ${mistakesFound} mistakes totaling ${totalLost}ms`);
    return totalLost;
  };

  const parseTimeString = (timeStr: string): number => {
    if (!timeStr || timeStr === '') return 0;

    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return (minutes * 60 + seconds) * 1000;
    }

    return 0;
  };

  const getClassName = (classId: string): string => {
    return classMap[classId] || `Class ${classId}`;
  };

  const formatTime = (ms: number): string => {
    if (!ms || ms === 0) return '-';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const sortClassNames = (a: string, b: string): number => {
    const order = ['White', 'Yellow', 'Orange', 'Brown', 'Green', 'Red', 'Blue'];
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);

    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  };

  const classNames = Object.keys(resultsByClass).sort(sortClassNames);

  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '10px',
          marginBottom: '20px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <Title level={2} style={{ margin: 0, marginBottom: '10px' }}>
            {competition ? `Live Results - ${competition.name}` : 'Live Results'}
          </Title>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '15px',
            paddingTop: '15px',
            borderTop: '1px solid #eee'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>📅</span>
              <span>{competition?.date || 'Loading...'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>🔄</span>
              <span style={{ color: dataStatus === 'online' ? '#00AA00' : '#FF0000' }}>
                {dataStatus === 'online' ? `Updated ${lastUpdate}` : `Error ${lastUpdate}`}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: dataStatus === 'online' ? '#00AA00' : '#FF0000' }}>
                {dataStatus === 'online' ? '✅ Live Data' : '❌ Connection Error'}
              </span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{
          background: 'white',
          padding: '15px',
          borderRadius: '10px',
          marginBottom: '20px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          display: 'flex',
          gap: '20px'
        }}>
          <label>
            Refresh Interval:
            <Select
              value={refreshInterval}
              onChange={setRefreshInterval}
              style={{ marginLeft: '10px', width: '120px' }}
              options={[
                { value: 5, label: '5 seconds' },
                { value: 10, label: '10 seconds' },
                { value: 15, label: '15 seconds' },
                { value: 30, label: '30 seconds' },
                { value: 60, label: '60 seconds' }
              ]}
            />
          </label>
          <label>
            Screens:
            <Select
              value={screenCount}
              onChange={setScreenCount}
              style={{ marginLeft: '10px', width: '80px' }}
              options={[
                { value: 1, label: '1' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' }
              ]}
            />
          </label>
        </div>

        {/* Results Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))',
          gap: '20px'
        }}>
          {classNames.map(className => {
            const runners = resultsByClass[className];
            const courseLength = courseLengths[className] || 0;

            return (
              <div key={className} style={{
                background: 'white',
                borderRadius: '10px',
                padding: '20px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '15px',
                  paddingBottom: '10px',
                  borderBottom: '2px solid #667eea'
                }}>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#667eea' }}>
                      {className}
                    </div>
                    {courseLength > 0 && (
                      <div style={{ color: '#666', fontSize: '14px' }}>
                        {courseLength}m
                      </div>
                    )}
                  </div>
                  <div>{runners.length} runners</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        color: '#666'
                      }}>Pl</th>
                      <th style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        color: '#666'
                      }}>Name</th>
                      <th style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        color: '#666'
                      }}>Club</th>
                      <th style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        color: '#666'
                      }}>Time</th>
                      <th style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        color: '#666'
                      }}>Behind</th>
                      <th style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        color: '#666'
                      }}>Lost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runners.map((runner, idx) => (
                      <tr key={idx} style={{ 
                        borderBottom: '1px solid #f0f0f0',
                      }}>
                        <td style={{ 
                          padding: '8px',
                          fontWeight: 'bold',
                          color: '#667eea'
                        }}>{runner.place || '-'}</td>
                        <td style={{ padding: '8px' }}>{runner.name}</td>
                        <td style={{ padding: '8px' }}>{runner.club}</td>
                        <td style={{ 
                          padding: '8px',
                          fontFamily: 'monospace'
                        }}>{runner.time}</td>
                        <td style={{ 
                          padding: '8px',
                          fontFamily: 'monospace'
                        }}>{runner.timeBehind ? formatTime(runner.timeBehind) : '-'}</td>
                        <td style={{ 
                          padding: '8px',
                          fontFamily: 'monospace'
                        }}>{runner.timeLost ? formatTime(runner.timeLost) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LiveResultsDisplay;
