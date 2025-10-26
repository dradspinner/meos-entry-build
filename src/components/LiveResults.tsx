import React, { useState, useEffect } from 'react';
import { Card, Typography, Table, Tag, Space, Alert, Spin, Badge } from 'antd';
import { TrophyOutlined, ClockCircleOutlined, UserOutlined, FireOutlined } from '@ant-design/icons';
import { meosApi } from '../services/meosApi';
import { eventMetaService } from '../services/eventMetaService';
import { localEntryService } from '../services/localEntryService';

const { Title, Text } = Typography;

interface RunnerResult {
  id: string;
  name: {
    first: string;
    last: string;
  };
  club: string;
  className: string;
  classId: string;
  position: number;
  status: 'finished' | 'in_forest' | 'checked_in' | 'dns' | 'dnf' | 'dsq';
  startTime?: Date;
  finishTime?: Date;
  totalTime?: number; // seconds
  courseLength?: number; // meters
  pace?: number; // minutes per km
  timeBehind?: number; // seconds behind leader
  lostTime?: number; // seconds lost compared to best time
}

interface ClassResults {
  className: string;
  classId: string;
  runners: RunnerResult[];
  courseLength?: number;
  bestTime?: number; // for lost time calculation
}

const LiveResults: React.FC = () => {
  const [results, setResults] = useState<ClassResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [eventMeta, setEventMeta] = useState(eventMetaService.get());

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setError(null);
        
        // Fetch results from MeOS (includes timing data and competitor IDs)
        const resultsData = await meosApi.getResults({ preliminary: true });
        
        // Fetch checked-in runners from local database
        const localEntries = localEntryService.getAllEntries()
          .filter(entry => entry.status === 'checked-in' || entry.checkedInAt);
        
        console.log(`[LiveResults] Local checked-in: ${localEntries.length}`);
        
        // Fetch all classes to get course lengths and class names
        const classes = await meosApi.getAllClasses();
        const classMap = new Map<string, any>();
        classes.forEach(cls => {
          classMap.set(cls.id, cls);
        });
        
        // Parse results from MeOS
        const classGroups = new Map<string, RunnerResult[]>();
        
        if (resultsData && resultsData.results) {
          const results = resultsData.results;
          const persons = Array.isArray(results.person) ? results.person : (results.person ? [results.person] : []);
          
          console.log(`[LiveResults] MeOS results: ${persons.length} persons`);
          
          persons.forEach((person: any) => {
            const competitorId = person.name?.['@attributes']?.id;
            const classId = person['@attributes']?.cls;
            const classInfo = classMap.get(classId);
            const className = classInfo?.name || `Class ${classId}`;
            
            const name = person.name?.['#text'] || person.name || '';
            const nameParts = name.split(' ');
            const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || 'Unknown';
            const lastName = nameParts[nameParts.length - 1] || 'Runner';
            
            const club = person.org?.['#text'] || person.org || '';
            const place = parseInt(person['@attributes']?.place || '0');
            
            // rt is in 1/10 seconds, convert to seconds
            const rtValue = parseInt(person['@attributes']?.rt || '0');
            const totalTime = rtValue / 10;
            
            // st is start time in 1/10 seconds after 00:00:00
            const stValue = parseInt(person['@attributes']?.st || '0');
            
            const status = parseInt(person['@attributes']?.stat || '0');
            const statusCode = status === 1 ? 'OK' : (status === 0 ? 'unknown' : 'DNF');
            
            const runner: RunnerResult = {
              id: competitorId || `${firstName}_${lastName}`,
              name: {
                first: firstName,
                last: lastName
              },
              club: club,
              className: className,
              classId: classId,
              position: place,
              status: status === 1 ? 'finished' : (stValue > 0 ? 'in_forest' : 'checked_in'),
              startTime: stValue > 0 ? new Date(stValue * 100) : undefined,
              totalTime: totalTime > 0 ? totalTime : undefined,
              courseLength: classInfo?.course?.length || undefined
            };
            
            const classKey = `${className}-${classId}`;
            if (!classGroups.has(classKey)) {
              classGroups.set(classKey, []);
            }
            classGroups.get(classKey)!.push(runner);
          });
        }
        
        // Add local checked-in entries that are NOT in MeOS results yet
        const meosNamesSet = new Set<string>();
        classGroups.forEach(runners => {
          runners.forEach(r => {
            meosNamesSet.add(`${r.name.first}_${r.name.last}`.toLowerCase());
          });
        });
        
        localEntries.forEach(localEntry => {
          const key = `${localEntry.name.first}_${localEntry.name.last}`.toLowerCase();
          
          if (!meosNamesSet.has(key)) {
            const runner: RunnerResult = {
              id: localEntry.id,
              name: localEntry.name,
              club: localEntry.club,
              className: localEntry.className,
              classId: localEntry.classId,
              position: 0,
              status: 'checked_in'
            };
            
            const classKey = `${runner.className}-${runner.classId}`;
            if (!classGroups.has(classKey)) {
              classGroups.set(classKey, []);
            }
            classGroups.get(classKey)!.push(runner);
          }
        });
        
        console.log(`[LiveResults] Total classes: ${classGroups.size}`);
        
        if (classGroups.size === 0) {
          setResults([]);
          setLastUpdate(new Date());
          return;
        }

        // Process each class
        const processedResults: ClassResults[] = [];

        for (const [classKey, runners] of classGroups.entries()) {
          const className = runners[0]?.className || 'Unknown';
          const classId = runners[0]?.classId || 'unknown';

          // Sort runners by status and time
          runners.sort((a, b) => {
            // Finished runners first, sorted by position
            if (a.status === 'finished' && b.status === 'finished') {
              if (a.position && b.position) {
                return a.position - b.position;
              }
              if (a.totalTime && b.totalTime) {
                return a.totalTime - b.totalTime;
              }
              return 0;
            }
            
            // Finished runners before others
            if (a.status === 'finished') return -1;
            if (b.status === 'finished') return 1;
            
            // In forest runners by start time (earliest first)
            if (a.status === 'in_forest' && b.status === 'in_forest') {
              if (a.startTime && b.startTime) {
                return a.startTime.getTime() - b.startTime.getTime();
              }
            }
            
            // In forest before checked in
            if (a.status === 'in_forest' && b.status === 'checked_in') return -1;
            if (a.status === 'checked_in' && b.status === 'in_forest') return 1;
            
            // Sort checked-in runners alphabetically by last name
            if (a.status === 'checked_in' && b.status === 'checked_in') {
              return a.name.last.localeCompare(b.name.last);
            }
            
            // Otherwise maintain original order
            return 0;
          });

          // Calculate additional metrics for finished runners
          let bestTime: number | undefined;
          
          runners.forEach((runner) => {
            if (runner.status === 'finished' && runner.totalTime) {
              // Set best time (first finished runner)
              if (!bestTime) {
                bestTime = runner.totalTime;
              }
              
              // Calculate pace (min/km)
              if (runner.courseLength && runner.totalTime) {
                const kmDistance = runner.courseLength / 1000;
                const minutes = runner.totalTime / 60;
                runner.pace = minutes / kmDistance;
              }
              
              // Calculate time behind leader
              if (bestTime) {
                runner.timeBehind = runner.totalTime - bestTime;
              }
            } else if (!runner.position) {
              runner.position = 0; // Not finished yet
            }
          });
          
          // Fetch detailed split analysis for lost time calculation
          await enrichRunnersWithSplitAnalysis(runners);

          processedResults.push({
            className,
            classId,
            runners,
            courseLength: runners[0]?.courseLength,
            bestTime
          });
        }

        // Sort classes alphabetically
        processedResults.sort((a, b) => a.className.localeCompare(b.className));

        setResults(processedResults);
        setLastUpdate(new Date());
      } catch (err) {
        console.error('Failed to fetch results:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch results');
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchResults();

    // Set up polling every 30 seconds
    const interval = setInterval(fetchResults, 30000);

    return () => clearInterval(interval);
  }, []);

  /**
   * Enrich runners with split analysis data from MeOS
   * Fetches detailed competitor data including lost time from splits
   */
  const enrichRunnersWithSplitAnalysis = async (runners: RunnerResult[]) => {
    const finishedRunners = runners.filter(r => r.status === 'finished' && r.id);
    
    for (const runner of finishedRunners) {
      try {
        // Try to parse runner ID if it's a string
        const runnerId = typeof runner.id === 'string' ? parseInt(runner.id) : runner.id;
        
        if (isNaN(runnerId)) {
          console.warn(`[LiveResults] Skipping runner with invalid ID: ${runner.id}`);
          continue;
        }
        
        // Fetch detailed competitor data with split analysis
        const details = await meosApi.lookupCompetitorById({ id: runnerId });
        
        if (details && details.splits) {
          // Calculate total lost time from all splits
          runner.lostTime = calculateTotalLostTime(details.splits);
        }
      } catch (error) {
        console.warn(`[LiveResults] Failed to get split analysis for ${runner.name.first} ${runner.name.last}:`, error);
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
  const calculateTotalLostTime = (splits: any[]): number => {
    if (!splits || splits.length === 0) return 0;
    
    let totalLostSeconds = 0;
    
    for (const split of splits) {
      if (split.analysis && split.analysis.mistake) {
        // Parse time string (MM:SS format) to seconds
        // Only positive values are considered (as per MeOS getMissedTime logic)
        const mistakeSeconds = parseTimeStringToSeconds(split.analysis.mistake);
        if (mistakeSeconds > 0) {
          totalLostSeconds += mistakeSeconds;
        }
      }
    }
    
    return totalLostSeconds;
  };
  
  /**
   * Parse MeOS time string (MM:SS or M:SS) to seconds
   */
  const parseTimeStringToSeconds = (timeStr: string): number => {
    if (!timeStr || timeStr === '') return 0;
    
    const parts = timeStr.split(':');
    if (parts.length >= 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
    
    return 0;
  };

  const determineStatus = (entry: any): RunnerResult['status'] => {
    // Priority 1: If they have a finish time and total time, they're finished
    if (entry.finishTime && entry.totalTime) {
      return 'finished';
    }
    
    // Priority 2: If they have a start time but no finish, they're in the forest
    // This will automatically transition checked-in runners once MeOS gives them a start time
    if (entry.startTime && !entry.finishTime) {
      return 'in_forest';
    }
    
    // Priority 3: Check for explicit status from MeOS (DNS, DNF, DSQ)
    if (entry.status === 'dns') {
      return 'dns';
    }
    if (entry.status === 'dnf') {
      return 'dnf';
    }
    if (entry.status === 'dsq') {
      return 'dsq';
    }
    
    // Priority 4: If marked as checked in locally, or no timing data yet
    // This includes local checked-in entries and MeOS entries without timing
    if (entry.status === 'checked_in' || entry.checkedInAt || (!entry.startTime && !entry.finishTime)) {
      return 'checked_in';
    }
    
    // Default: treat as checked in if we can't determine status
    return 'checked_in';
  };

  const formatTime = (seconds?: number): string => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPace = (pace?: number): string => {
    if (!pace) return '-';
    const mins = Math.floor(pace);
    const secs = Math.floor((pace % 1) * 60);
    return `${mins}:${secs.toString().padStart(2, '0')}/km`;
  };

  const getStatusColor = (status: RunnerResult['status']): string => {
    switch (status) {
      case 'finished': return 'success';
      case 'in_forest': return 'processing';
      case 'checked_in': return 'default';
      case 'dns': return 'warning';
      case 'dnf': return 'error';
      case 'dsq': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status: RunnerResult['status']): string => {
    switch (status) {
      case 'finished': return 'Finished';
      case 'in_forest': return 'In Forest';
      case 'checked_in': return 'Checked In';
      case 'dns': return 'DNS';
      case 'dnf': return 'DNF';
      case 'dsq': return 'DSQ';
      default: return 'Unknown';
    }
  };

  const getPositionStyle = (position: number) => {
    if (position === 1) return { color: '#faad14', fontWeight: 'bold' }; // Gold
    if (position === 2) return { color: '#722ed1', fontWeight: 'bold' }; // Silver
    if (position === 3) return { color: '#fa8c16', fontWeight: 'bold' }; // Bronze
    return {};
  };

  if (error) {
    return (
      <div style={{ padding: '24px', height: '100vh', backgroundColor: '#f0f2f5' }}>
        <Alert
          message="Error Loading Results"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: '24px' }}
        />
      </div>
    );
  }

  return (
    <div style={{ 
      padding: '16px', 
      backgroundColor: '#f0f2f5', 
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      {/* Header */}
      <Card 
        style={{ 
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
          color: 'white',
          border: 'none'
        }}
        bodyStyle={{ padding: '16px' }}
      >
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space align="center">
            <TrophyOutlined style={{ fontSize: '32px', color: '#faad14' }} />
            <div>
              <Title level={2} style={{ color: 'white', margin: 0 }}>
                Live Results - {eventMeta?.name || 'DVOA Event'}
              </Title>
              <Text style={{ color: '#e6f7ff' }}>
                {eventMeta?.date || new Date().toISOString().split('T')[0]}
              </Text>
            </div>
          </Space>
          <Space align="center" direction="vertical" size="small" style={{ alignItems: 'flex-end' }}>
            <Space align="center">
              <ClockCircleOutlined style={{ fontSize: '16px' }} />
              <Text style={{ color: '#e6f7ff' }}>
                {loading ? 'Updating...' : `Last updated: ${lastUpdate?.toLocaleTimeString() || 'Never'}`}
              </Text>
              {loading && <Spin size="small" />}
            </Space>
            <Text style={{ color: '#e6f7ff', fontSize: '12px' }}>
              Total: {results.reduce((sum, cls) => sum + cls.runners.length, 0)} runners
            </Text>
          </Space>
        </Space>
      </Card>

      {/* Results by Class */}
      {results.map((classResult) => (
        <Card 
          key={`${classResult.className}-${classResult.classId}`}
          title={
            <Space>
              <Badge count={classResult.runners.length} showZero>
                <Title level={4} style={{ margin: 0, color: '#1890ff' }}>
                  {classResult.className}
                </Title>
              </Badge>
              {classResult.courseLength && (
                <Tag color="blue">
                  {(classResult.courseLength / 1000).toFixed(1)}km
                </Tag>
              )}
            </Space>
          }
          style={{ marginBottom: '16px' }}
        >
          <Table
            dataSource={classResult.runners}
            pagination={false}
            size="middle"
            rowKey="id"
            rowClassName={(record) => 
              record.position === 1 ? 'winner-row' : 
              record.position <= 3 ? 'podium-row' : ''
            }
            columns={[
              {
                title: 'Pos',
                dataIndex: 'position',
                key: 'position',
                width: 60,
                align: 'center',
                render: (position: number) => (
                  <Text style={getPositionStyle(position)}>
                    {position || '-'}
                  </Text>
                )
              },
              {
                title: 'Runner',
                key: 'runner',
                width: 200,
                render: (record: RunnerResult) => (
                  <Space direction="vertical" size="small">
                    <Text strong style={{ fontSize: '14px' }}>
                      {record.name.first} {record.name.last}
                    </Text>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {record.club}
                    </Text>
                  </Space>
                )
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                width: 100,
                render: (status: RunnerResult['status']) => (
                  <Tag color={getStatusColor(status)}>
                    {getStatusText(status)}
                  </Tag>
                )
              },
              {
                title: 'Time',
                dataIndex: 'totalTime',
                key: 'time',
                width: 80,
                render: (time: number) => (
                  <Text style={{ fontFamily: 'monospace', fontSize: '14px' }}>
                    {formatTime(time)}
                  </Text>
                )
              },
              {
                title: 'Pace',
                dataIndex: 'pace',
                key: 'pace',
                width: 90,
                render: (pace: number) => (
                  <Text style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {formatPace(pace)}
                  </Text>
                )
              },
              {
                title: 'Behind',
                dataIndex: 'timeBehind',
                key: 'behind',
                width: 80,
                render: (timeBehind: number) => (
                  <Text 
                    style={{ 
                      fontFamily: 'monospace', 
                      fontSize: '12px',
                      color: timeBehind > 0 ? '#ff4d4f' : undefined
                    }}
                  >
                    {timeBehind ? `+${formatTime(timeBehind)}` : '-'}
                  </Text>
                )
              },
              {
                title: 'Lost',
                dataIndex: 'lostTime',
                key: 'lost',
                width: 80,
                render: (lostTime: number) => (
                  <Text 
                    style={{ 
                      fontFamily: 'monospace', 
                      fontSize: '12px',
                      color: '#ff7a45'
                    }}
                  >
                    {lostTime ? formatTime(lostTime) : '-'}
                  </Text>
                )
              }
            ]}
          />
        </Card>
      ))}

      {results.length === 0 && !loading && (
        <Card style={{ textAlign: 'center', padding: '48px' }}>
          <UserOutlined style={{ fontSize: '48px', color: '#d9d9d9' }} />
          <Title level={4} type="secondary">No results available yet</Title>
          <Text type="secondary">
            Results will appear here as runners check in and start their courses.
          </Text>
        </Card>
      )}

      {/* Custom CSS */}
      <style>{`
        .winner-row {
          background-color: #fff7e6 !important;
        }
        .podium-row {
          background-color: #f6ffed !important;
        }
        .ant-table-thead > tr > th {
          background-color: #fafafa !important;
          font-weight: bold !important;
        }
      `}</style>
    </div>
  );
};

export default LiveResults;