import React, { useState, useEffect } from 'react';
import { Card, Typography, Table, Tag, Space, Alert, Spin, Badge } from 'antd';
import { TrophyOutlined, ClockCircleOutlined, UserOutlined, FireOutlined } from '@ant-design/icons';
import { meosApi } from '../services/meosApi';
import { eventMetaService } from '../services/eventMetaService';

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
        
        // Fetch all entries from MeOS
        const entries = await meosApi.getAllEntries();
        
        if (!entries || entries.length === 0) {
          setResults([]);
          setLastUpdate(new Date());
          return;
        }

        // Process entries into class-grouped results
        const classGroups = new Map<string, RunnerResult[]>();

        entries.forEach((entry: any) => {
          const runner: RunnerResult = {
            id: entry.id || `${entry.name?.first}_${entry.name?.last}`,
            name: {
              first: entry.name?.first || 'Unknown',
              last: entry.name?.last || 'Runner'
            },
            club: entry.club || '',
            className: entry.className || 'Unknown',
            classId: entry.classId || 'unknown',
            position: 0, // Will be calculated after sorting
            status: determineStatus(entry),
            startTime: entry.startTime ? new Date(entry.startTime) : undefined,
            finishTime: entry.finishTime ? new Date(entry.finishTime) : undefined,
            totalTime: entry.totalTime || undefined,
            courseLength: entry.courseLength || undefined
          };

          const classKey = `${runner.className}-${runner.classId}`;
          if (!classGroups.has(classKey)) {
            classGroups.set(classKey, []);
          }
          classGroups.get(classKey)!.push(runner);
        });

        // Process each class
        const processedResults: ClassResults[] = [];

        classGroups.forEach((runners, classKey) => {
          const className = runners[0]?.className || 'Unknown';
          const classId = runners[0]?.classId || 'unknown';

          // Sort runners by status and time
          runners.sort((a, b) => {
            // Finished runners first, sorted by time
            if (a.status === 'finished' && b.status === 'finished') {
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
            
            // Otherwise maintain original order
            return 0;
          });

          // Assign positions and calculate times
          let position = 1;
          let bestTime: number | undefined;
          
          runners.forEach((runner, index) => {
            if (runner.status === 'finished' && runner.totalTime) {
              runner.position = position++;
              
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
              
              // Calculate lost time (simplified - actual lost time would need split analysis)
              if (bestTime) {
                runner.lostTime = runner.totalTime - bestTime;
              }
            } else {
              runner.position = 0; // Not finished yet
            }
          });

          processedResults.push({
            className,
            classId,
            runners,
            courseLength: runners[0]?.courseLength,
            bestTime
          });
        });

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

  const determineStatus = (entry: any): RunnerResult['status'] => {
    if (entry.finishTime && entry.totalTime) {
      return 'finished';
    } else if (entry.startTime && !entry.finishTime) {
      return 'in_forest';
    } else if (entry.status === 'checked_in' || (!entry.startTime && !entry.finishTime)) {
      return 'checked_in';
    } else if (entry.status === 'dns') {
      return 'dns';
    } else if (entry.status === 'dnf') {
      return 'dnf';
    } else if (entry.status === 'dsq') {
      return 'dsq';
    }
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
          <Space align="center">
            <ClockCircleOutlined style={{ fontSize: '16px' }} />
            <Text style={{ color: '#e6f7ff' }}>
              {loading ? 'Updating...' : `Last updated: ${lastUpdate?.toLocaleTimeString() || 'Never'}`}
            </Text>
            {loading && <Spin size="small" />}
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