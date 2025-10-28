// Database Cleanup Component
// Streamlined tool for managing runner database quality and duplicates

import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Typography,
  Space,
  Modal,
  Tabs,
  Statistic,
  Row,
  Col,
  Alert,
  Input,
  Tag,
  Select,
  App,
  Badge,
  Divider,
  Collapse,
  Progress,
  Checkbox,
} from 'antd';
import {
  DeleteOutlined,
  MergeCellsOutlined,
  WarningOutlined,
  TeamOutlined,
  FileTextOutlined,
  DownloadOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import { localRunnerService, LocalRunner } from '../services/localRunnerService';
import { iofRunnerDatabaseService } from '../services/iofRunnerDatabaseService';
import { duplicateDetectionService, DuplicateGroup } from '../services/duplicateDetectionService';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

interface DatabaseCleanupProps {
  onBack?: () => void;
}

export const DatabaseCleanup: React.FC<DatabaseCleanupProps> = ({ onBack }) => {
  const { message: messageApi } = App.useApp();
  
  // State
  const [loading, setLoading] = useState(false);
  const [runners, setRunners] = useState<LocalRunner[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [selectedRunners, setSelectedRunners] = useState<Set<string>>(new Set());
  const [clubFilter, setClubFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('duplicates');
  const [duplicateThreshold, setDuplicateThreshold] = useState(85);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setLoading(true);
    try {
      const allRunners = localRunnerService.getAllRunners();
      setRunners(allRunners);
      
      // Run duplicate detection
      const duplicates = duplicateDetectionService.findDuplicates(allRunners, duplicateThreshold);
      setDuplicateGroups(duplicates);
      
      messageApi.success(`Loaded ${allRunners.length} runners, found ${duplicates.length} potential duplicate groups`);
    } catch (error) {
      console.error('Failed to load data:', error);
      messageApi.error('Failed to load runner data');
    } finally {
      setLoading(false);
    }
  };

  // Refresh duplicates with new threshold
  const refreshDuplicates = () => {
    setLoading(true);
    try {
      const duplicates = duplicateDetectionService.findDuplicates(runners, duplicateThreshold);
      setDuplicateGroups(duplicates);
      messageApi.success(`Found ${duplicates.length} duplicate groups with ${duplicateThreshold}% threshold`);
    } catch (error) {
      console.error('Failed to refresh duplicates:', error);
      messageApi.error('Failed to refresh duplicates');
    } finally {
      setLoading(false);
    }
  };

  // Merge selected runners
  const handleMerge = (group: DuplicateGroup) => {
    Modal.confirm({
      title: 'Merge Duplicate Runners?',
      content: (
        <div>
          <Paragraph>
            This will keep the most complete record and remove the others. The merged record will combine:
          </Paragraph>
          <ul>
            <li>Usage counts (sum of all times used)</li>
            <li>Most recent "last used" date</li>
            <li>Most complete data (birth year, club, etc.)</li>
          </ul>
          <Paragraph strong>{group.runners.length} runners will be merged into 1.</Paragraph>
        </div>
      ),
      okText: 'Merge',
      okType: 'primary',
      onOk: () => {
        try {
          // Find the most complete runner (one with most filled fields)
          const scored = group.runners.map(r => ({
            runner: r,
            score: [r.birthYear, r.sex, r.club, r.cardNumber, r.phone, r.email].filter(Boolean).length
          }));
          scored.sort((a, b) => b.score - a.score);
          
          const keepRunner = scored[0].runner;
          const mergeRunners = group.runners.filter(r => r.id !== keepRunner.id);
          
          // Sum usage counts
          const totalUsage = group.runners.reduce((sum, r) => sum + (r.timesUsed || 0), 0);
          
          // Find most recent lastUsed
          const mostRecentUsed = group.runners.reduce((latest, r) => {
            const rDate = r.lastUsed instanceof Date ? r.lastUsed : new Date(r.lastUsed);
            const latestDate = latest instanceof Date ? latest : new Date(latest);
            return rDate > latestDate ? rDate : latest;
          }, new Date(0));
          
          // Update the kept runner
          localRunnerService.updateRunner(keepRunner.id, {
            timesUsed: totalUsage,
            lastUsed: mostRecentUsed
          } as any);
          
          // Delete the others
          mergeRunners.forEach(r => localRunnerService.deleteRunner(r.id));
          
          messageApi.success(`Merged ${group.runners.length} runners into one record`);
          loadData();
        } catch (error) {
          console.error('Merge failed:', error);
          messageApi.error('Failed to merge runners');
        }
      }
    });
  };

  // Delete a group of duplicates
  const handleDeleteGroup = (group: DuplicateGroup) => {
    Modal.confirm({
      title: 'Delete All Runners in This Group?',
      content: `This will permanently delete ${group.runners.length} runners from your database.`,
      okText: 'Delete All',
      okType: 'danger',
      onOk: () => {
        try {
          group.runners.forEach(r => localRunnerService.deleteRunner(r.id));
          messageApi.success(`Deleted ${group.runners.length} runners`);
          loadData();
        } catch (error) {
          console.error('Delete failed:', error);
          messageApi.error('Failed to delete runners');
        }
      }
    });
  };

  // Delete single runner
  const handleDeleteSingle = (runnerId: string) => {
    try {
      localRunnerService.deleteRunner(runnerId);
      messageApi.success('Runner deleted');
      loadData();
    } catch (error) {
      console.error('Delete failed:', error);
      messageApi.error('Failed to delete runner');
    }
  };

  // Export database
  const handleExport = () => {
    try {
      const jsonData = localRunnerService.exportDatabase();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `runner_database_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      messageApi.success('Database exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      messageApi.error('Failed to export database');
    }
  };

  // Bulk delete selected
  const handleBulkDelete = () => {
    if (selectedRunners.size === 0) {
      messageApi.warning('No runners selected');
      return;
    }

    Modal.confirm({
      title: 'Delete Selected Runners?',
      content: `This will permanently delete ${selectedRunners.size} runners from your database.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: () => {
        try {
          selectedRunners.forEach(id => localRunnerService.deleteRunner(id));
          messageApi.success(`Deleted ${selectedRunners.size} runners`);
          setSelectedRunners(new Set());
          loadData();
        } catch (error) {
          console.error('Bulk delete failed:', error);
          messageApi.error('Failed to delete runners');
        }
      }
    });
  };

  // Get club statistics
  const clubStats = duplicateDetectionService.getClubStats(runners);
  const clubs = clubStats.map(s => s.club);

  // Filter runners
  const filteredRunners = runners.filter(runner => {
    const matchesClub = clubFilter === 'all' || runner.club === clubFilter;
    const matchesSearch = !searchText || 
      `${runner.name.first} ${runner.name.last}`.toLowerCase().includes(searchText.toLowerCase()) ||
      runner.club.toLowerCase().includes(searchText.toLowerCase());
    return matchesClub && matchesSearch;
  });

  // Get incomplete runners
  const incompleteRunners = duplicateDetectionService.findIncompleteRunners(runners);
  
  // Get suspicious entries
  const suspiciousEntries = duplicateDetectionService.findSuspiciousEntries(runners);

  // Get duplicate stats
  const duplicateStats = duplicateDetectionService.getDuplicateStats(runners, duplicateGroups);

  // Render duplicate group card
  const renderDuplicateGroup = (group: DuplicateGroup) => {
    const confidenceColor = group.similarity >= 95 ? 'red' : group.similarity >= 85 ? 'orange' : 'gold';
    const confidenceText = group.similarity >= 95 ? 'High' : group.similarity >= 85 ? 'Medium' : 'Low';

    return (
      <Panel
        key={group.id}
        header={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Tag color={confidenceColor}>{confidenceText} Confidence</Tag>
              <Text strong>
                {group.runners[0]?.name.first} {group.runners[0]?.name.last}
              </Text>
              <Text type="secondary">
                {group.runners.length} runners • {group.similarity.toFixed(0)}% similar
              </Text>
            </Space>
          </div>
        }
        extra={
          <Space onClick={(e) => e.stopPropagation()}>
            <Button 
              size="small" 
              icon={<MergeCellsOutlined />} 
              type="primary"
              onClick={() => handleMerge(group)}
            >
              Merge
            </Button>
            <Button 
              size="small" 
              icon={<DeleteOutlined />} 
              danger
              onClick={() => handleDeleteGroup(group)}
            >
              Delete All
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={group.runners}
          rowKey="id"
          size="small"
          pagination={false}
          columns={[
            {
              title: 'Name',
              render: (_, runner: LocalRunner) => (
                <Text strong>{runner.name.first} {runner.name.last}</Text>
              ),
            },
            {
              title: 'Club',
              dataIndex: 'club',
            },
            {
              title: 'YB',
              render: (_, runner: LocalRunner) => runner.birthYear || '-',
            },
            {
              title: 'Card',
              render: (_, runner: LocalRunner) => runner.cardNumber || '-',
            },
            {
              title: 'Times Used',
              render: (_, runner: LocalRunner) => runner.timesUsed || 0,
            },
            {
              title: 'Last Used',
              render: (_, runner: LocalRunner) => 
                new Date(runner.lastUsed).toLocaleDateString(),
            },
            {
              title: 'Action',
              render: (_, runner: LocalRunner) => (
                <Button 
                  size="small" 
                  icon={<DeleteOutlined />} 
                  danger
                  onClick={() => handleDeleteSingle(runner.id)}
                >
                  Delete
                </Button>
              ),
            },
          ]}
        />
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">Reason: {group.reason}</Text>
        </div>
      </Panel>
    );
  };

  return (
    <div>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {onBack && (
                <Button 
                  icon={<ArrowLeftOutlined />} 
                  onClick={onBack}
                  size="large"
                >
                  Back
                </Button>
              )}
              <Title level={3} style={{ margin: 0 }}>
                <WarningOutlined style={{ marginRight: 8 }} />
                Database Cleanup
              </Title>
            </div>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                Export Database
              </Button>
              <Button 
                icon={<DeleteOutlined />} 
                danger 
                onClick={handleBulkDelete}
                disabled={selectedRunners.size === 0}
              >
                Delete Selected ({selectedRunners.size})
              </Button>
            </Space>
          </div>

          {/* Statistics Dashboard */}
          <Row gutter={16}>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Total Runners"
                  value={runners.length}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Duplicate Groups"
                  value={duplicateGroups.length}
                  valueStyle={{ color: duplicateGroups.length > 0 ? '#cf1322' : '#3f8600' }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Incomplete Records"
                  value={incompleteRunners.length}
                  valueStyle={{ color: incompleteRunners.length > 0 ? '#faad14' : '#3f8600' }}
                  prefix={<InfoCircleOutlined />}
                />
              </Card>
            </Col>
            <Col span={6}>
              <Card size="small">
                <Statistic
                  title="Suspicious Entries"
                  value={suspiciousEntries.length}
                  valueStyle={{ color: suspiciousEntries.length > 0 ? '#faad14' : '#3f8600' }}
                  prefix={<WarningOutlined />}
                />
              </Card>
            </Col>
          </Row>

          {/* Main Content Tabs */}
          <Tabs activeKey={activeTab} onChange={setActiveTab}>
            
            {/* Duplicates Tab */}
            <TabPane 
              tab={
                <span>
                  <Badge count={duplicateGroups.length} offset={[10, 0]}>
                    <MergeCellsOutlined /> Duplicates
                  </Badge>
                </span>
              } 
              key="duplicates"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  message="Duplicate Detection"
                  description="Review potential duplicate runners based on name similarity. Merge duplicates to consolidate records or delete unwanted entries."
                  type="info"
                  showIcon
                />

                {/* Duplicate Controls */}
                <Row gutter={16} align="middle">
                  <Col span={8}>
                    <Space>
                      <Text>Similarity Threshold:</Text>
                      <Select 
                        value={duplicateThreshold} 
                        onChange={setDuplicateThreshold}
                        style={{ width: 100 }}
                      >
                        <Select.Option value={95}>95%</Select.Option>
                        <Select.Option value={90}>90%</Select.Option>
                        <Select.Option value={85}>85%</Select.Option>
                        <Select.Option value={80}>80%</Select.Option>
                        <Select.Option value={75}>75%</Select.Option>
                      </Select>
                      <Button onClick={refreshDuplicates} loading={loading}>
                        Refresh
                      </Button>
                    </Space>
                  </Col>
                  <Col span={16}>
                    <Row gutter={8}>
                      <Col>
                        <Tag color="red">High: {duplicateStats.highConfidence}</Tag>
                      </Col>
                      <Col>
                        <Tag color="orange">Medium: {duplicateStats.mediumConfidence}</Tag>
                      </Col>
                      <Col>
                        <Tag color="gold">Low: {duplicateStats.lowConfidence}</Tag>
                      </Col>
                    </Row>
                  </Col>
                </Row>

                {/* Duplicate Groups */}
                {duplicateGroups.length > 0 ? (
                  <Collapse>
                    {duplicateGroups.map(group => renderDuplicateGroup(group))}
                  </Collapse>
                ) : (
                  <Alert
                    message="No Duplicates Found"
                    description="Your database looks clean! No duplicate runners detected at the current threshold."
                    type="success"
                    icon={<CheckCircleOutlined />}
                    showIcon
                  />
                )}
              </Space>
            </TabPane>

            {/* Clubs Tab */}
            <TabPane 
              tab={<span><TeamOutlined /> Clubs ({clubs.length})</span>} 
              key="clubs"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  message="Club Statistics"
                  description="Browse runners by club affiliation. View club sizes and manage club-specific entries."
                  type="info"
                  showIcon
                />

                <Table
                  dataSource={clubStats}
                  rowKey="club"
                  size="small"
                  pagination={{ pageSize: 20 }}
                  columns={[
                    {
                      title: 'Club',
                      dataIndex: 'club',
                      render: (club: string) => <Text strong>{club}</Text>,
                    },
                    {
                      title: 'Runners',
                      dataIndex: 'count',
                      sorter: (a, b) => b.count - a.count,
                      defaultSortOrder: 'descend',
                    },
                    {
                      title: 'Percentage',
                      render: (_, record) => (
                        <Space>
                          <Progress 
                            percent={Math.round(record.percentage)} 
                            size="small" 
                            style={{ width: 100 }}
                          />
                          <Text>{record.percentage.toFixed(1)}%</Text>
                        </Space>
                      ),
                    },
                    {
                      title: 'Action',
                      render: (_, record) => (
                        <Button 
                          size="small" 
                          icon={<EyeOutlined />}
                          onClick={() => {
                            setClubFilter(record.club);
                            setActiveTab('browse');
                          }}
                        >
                          View
                        </Button>
                      ),
                    },
                  ]}
                />
              </Space>
            </TabPane>

            {/* Browse/Search Tab */}
            <TabPane 
              tab={<span><SearchOutlined /> Browse</span>} 
              key="browse"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  message="Browse All Runners"
                  description="Search and filter your complete runner database. Select runners for bulk operations."
                  type="info"
                  showIcon
                />

                {/* Filters */}
                <Row gutter={16}>
                  <Col span={12}>
                    <Input
                      placeholder="Search by name or club..."
                      prefix={<SearchOutlined />}
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      allowClear
                    />
                  </Col>
                  <Col span={12}>
                    <Select
                      placeholder="Filter by club"
                      value={clubFilter}
                      onChange={setClubFilter}
                      style={{ width: '100%' }}
                      allowClear
                      showSearch
                    >
                      <Select.Option value="all">All Clubs</Select.Option>
                      {clubs.map(club => (
                        <Select.Option key={club} value={club}>{club}</Select.Option>
                      ))}
                    </Select>
                  </Col>
                </Row>

                {/* Runners Table */}
                <Table
                  dataSource={filteredRunners}
                  rowKey="id"
                  size="small"
                  loading={loading}
                  rowSelection={{
                    selectedRowKeys: Array.from(selectedRunners),
                    onChange: (keys) => setSelectedRunners(new Set(keys as string[])),
                  }}
                  pagination={{
                    pageSize: 50,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} runners`,
                  }}
                  columns={[
                    {
                      title: 'Name',
                      render: (_, runner: LocalRunner) => (
                        <Text strong>{runner.name.first} {runner.name.last}</Text>
                      ),
                      sorter: (a, b) => 
                        `${a.name.first} ${a.name.last}`.localeCompare(`${b.name.first} ${b.name.last}`),
                    },
                    {
                      title: 'Club',
                      dataIndex: 'club',
                      sorter: (a, b) => a.club.localeCompare(b.club),
                    },
                    {
                      title: 'YB',
                      render: (_, runner) => runner.birthYear || '-',
                      sorter: (a, b) => (a.birthYear || 0) - (b.birthYear || 0),
                    },
                    {
                      title: 'Card',
                      render: (_, runner) => runner.cardNumber || '-',
                    },
                    {
                      title: 'Used',
                      render: (_, runner) => runner.timesUsed || 0,
                      sorter: (a, b) => (a.timesUsed || 0) - (b.timesUsed || 0),
                    },
                    {
                      title: 'Last Used',
                      render: (_, runner) => new Date(runner.lastUsed).toLocaleDateString(),
                      sorter: (a, b) => 
                        new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime(),
                    },
                    {
                      title: 'Action',
                      render: (_, runner) => (
                        <Button 
                          size="small" 
                          icon={<DeleteOutlined />} 
                          danger
                          onClick={() => handleDeleteSingle(runner.id)}
                        >
                          Delete
                        </Button>
                      ),
                    },
                  ]}
                />
              </Space>
            </TabPane>

            {/* Data Quality Tab */}
            <TabPane 
              tab={
                <span>
                  <Badge count={incompleteRunners.length + suspiciousEntries.length} offset={[10, 0]}>
                    <FileTextOutlined /> Data Quality
                  </Badge>
                </span>
              } 
              key="quality"
            >
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  message="Data Quality Issues"
                  description="Review incomplete records and suspicious entries that may need attention."
                  type="warning"
                  showIcon
                />

                {/* Incomplete Records */}
                <Card title={`Incomplete Records (${incompleteRunners.length})`} size="small">
                  {incompleteRunners.length > 0 ? (
                    <Table
                      dataSource={incompleteRunners}
                      rowKey="id"
                      size="small"
                      pagination={{ pageSize: 20 }}
                      columns={[
                        {
                          title: 'Name',
                          render: (_, runner: LocalRunner) => (
                            <Text strong>{runner.name.first} {runner.name.last}</Text>
                          ),
                        },
                        {
                          title: 'Missing Data',
                          render: (_, runner: LocalRunner) => {
                            const missing = [];
                            if (!runner.birthYear) missing.push('YB');
                            if (!runner.sex) missing.push('Gender');
                            if (!runner.club) missing.push('Club');
                            return missing.map(m => <Tag key={m} color="orange">{m}</Tag>);
                          },
                        },
                        {
                          title: 'Action',
                          render: (_, runner) => (
                            <Button 
                              size="small" 
                              icon={<DeleteOutlined />} 
                              danger
                              onClick={() => handleDeleteSingle(runner.id)}
                            >
                              Delete
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <Alert message="All records are complete!" type="success" showIcon />
                  )}
                </Card>

                {/* Suspicious Entries */}
                <Card title={`Suspicious Entries (${suspiciousEntries.length})`} size="small">
                  {suspiciousEntries.length > 0 ? (
                    <Table
                      dataSource={suspiciousEntries}
                      rowKey={(record) => record.runner.id}
                      size="small"
                      pagination={{ pageSize: 20 }}
                      columns={[
                        {
                          title: 'Name',
                          render: (_, record) => (
                            <Text strong>{record.runner.name.first} {record.runner.name.last}</Text>
                          ),
                        },
                        {
                          title: 'Issues',
                          render: (_, record) => (
                            <>
                              {record.issues.map((issue, idx) => (
                                <Tag key={idx} color="red" icon={<WarningOutlined />}>
                                  {issue}
                                </Tag>
                              ))}
                            </>
                          ),
                        },
                        {
                          title: 'Action',
                          render: (_, record) => (
                            <Button 
                              size="small" 
                              icon={<DeleteOutlined />} 
                              danger
                              onClick={() => handleDeleteSingle(record.runner.id)}
                            >
                              Delete
                            </Button>
                          ),
                        },
                      ]}
                    />
                  ) : (
                    <Alert message="No suspicious entries found!" type="success" showIcon />
                  )}
                </Card>
              </Space>
            </TabPane>
          </Tabs>
        </Space>
      </Card>
    </div>
  );
};

export default DatabaseCleanup;
