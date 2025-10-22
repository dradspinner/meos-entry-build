// Database Manager Component - Electron Window
// Comprehensive runner database management and diagnostics

import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Table,
  Typography,
  Space,
  message,
  Row,
  Col,
  Statistic,
  Alert,
  Input,
  Tag,
  Divider,
  Spin,
  Modal,
} from 'antd';
import {
  DatabaseOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  FileTextOutlined,
  UserOutlined,
  SyncOutlined,
  CloudDownloadOutlined,
  SettingOutlined,
  EditOutlined,
  ImportOutlined,
} from '@ant-design/icons';
import { localRunnerService, LocalRunner } from '../services/localRunnerService';

const { Title, Text, Paragraph } = Typography;
const { Search } = Input;

export const DatabaseManager: React.FC = () => {
  const [runners, setRunners] = useState<LocalRunner[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [stats, setStats] = useState<{ total: number; totalUsage: number; lastUsed?: Date }>({ total: 0, totalUsage: 0, lastUsed: undefined });
  const [cloudPath, setCloudPath] = useState<string | null>(null);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [tempCloudPath, setTempCloudPath] = useState('');
  const [xmlImporting, setXmlImporting] = useState(false);
  const [pendingXmlFile, setPendingXmlFile] = useState<File | null>(null);

  useEffect(() => {
    loadRunners();
    loadCloudPath();
    
    // Listen for localStorage changes from other windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'local_runner_database' || e.key === 'cloud_runner_database_path') {
        console.log('[DatabaseManager] Storage changed, reloading...');
        loadRunners();
        if (e.key === 'cloud_runner_database_path') {
          loadCloudPath();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loadRunners = () => {
    setLoading(true);
    try {
      localRunnerService.refreshFromStorage();
      setRunners(localRunnerService.getAllRunners());
      setStats(localRunnerService.getStats());
      console.log('[DatabaseManager] Loaded runners:', localRunnerService.getStats());
    } catch (error) {
      console.error('[DatabaseManager] Failed to load runners:', error);
      message.error('Failed to load runner database');
    } finally {
      setLoading(false);
    }
  };

  const loadCloudPath = () => {
    const path = localStorage.getItem('cloud_runner_database_path');
    setCloudPath(path);
    setTempCloudPath(path || '');
  };

  const handleRefresh = () => {
    message.info('Refreshing runner database...');
    loadRunners();
    message.success('Runner database refreshed');
  };

  const handleConfigureCloudPath = () => {
    setConfigModalVisible(true);
  };

  const handleSaveCloudPath = () => {
    if (!tempCloudPath.trim()) {
      message.error('Please enter a valid cloud path');
      return;
    }
    
    localStorage.setItem('cloud_runner_database_path', tempCloudPath.trim());
    setCloudPath(tempCloudPath.trim());
    setConfigModalVisible(false);
    message.success('Cloud path configured successfully');
  };

  const handleChooseCloudPath = async () => {
    if (window.electronAPI && window.electronAPI.chooseRunnerDatabasePath) {
      try {
        const newPath = await window.electronAPI.chooseRunnerDatabasePath();
        if (newPath) {
          setTempCloudPath(newPath);
          message.success('Path selected');
        }
      } catch (error) {
        console.error('[DatabaseManager] Failed to choose path:', error);
        message.error('Failed to open file picker');
      }
    } else {
      message.info('File picker not available. Please enter the path manually.');
    }
  };

  const handleXMLImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    setPendingXmlFile(file);
  };

  const executeXMLImport = async (mode: 'merge' | 'replace') => {
    if (!pendingXmlFile) return;
    
    const file = pendingXmlFile;
    setPendingXmlFile(null);
    setXmlImporting(true);
    
    try {
      message.loading(`${mode === 'merge' ? 'Merging' : 'Replacing with'} XML file...`, 0);
      
      const xmlContent = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      const competitors = xmlDoc.getElementsByTagName('Competitor');
      const xmlRunners = [];
      
      for (let i = 0; i < competitors.length; i++) {
        const competitor = competitors[i];
        const person = competitor.getElementsByTagName('Person')[0];
        if (!person) continue;
        
        const nameElement = person.getElementsByTagName('Name')[0];
        if (!nameElement) continue;
        
        const givenName = nameElement.getElementsByTagName('Given')[0]?.textContent?.trim();
        const familyName = nameElement.getElementsByTagName('Family')[0]?.textContent?.trim();
        
        if (!givenName || !familyName) continue;
        
        const sex = person.getAttribute('sex') || undefined;
        const birthDateElement = person.getElementsByTagName('BirthDate')[0];
        let birthYear;
        if (birthDateElement) {
          const birthDate = birthDateElement.textContent?.trim();
          if (birthDate) birthYear = parseInt(birthDate.split('-')[0]);
        }
        
        const controlCard = competitor.getElementsByTagName('ControlCard')[0];
        let cardNumber;
        if (controlCard) {
          const cardText = controlCard.textContent?.trim();
          if (cardText) cardNumber = parseInt(cardText);
        }
        
        const orgElement = competitor.getElementsByTagName('Organisation')[0];
        let club = '';
        if (orgElement) {
          const orgName = orgElement.getElementsByTagName('Name')[0]?.textContent?.trim();
          if (orgName) {
            club = orgName;
          } else {
            const orgId = orgElement.getElementsByTagName('Id')[0]?.textContent?.trim();
            if (orgId === '852') club = 'DVOA';
            else if (orgId === '3') club = 'QOC';
            else if (orgId === '4') club = 'HVO';
            else if (orgId === '14') club = 'None';
            else if (orgId === '90010') club = 'CSU';
            else club = orgId ? `Org-${orgId}` : '';
          }
        }
        
        xmlRunners.push({
          name: { first: givenName, last: familyName },
          club: club,
          birthYear: birthYear,
          sex: sex as 'M' | 'F' | undefined,
          cardNumber: cardNumber,
          nationality: '',
          phone: '',
          email: ''
        });
      }
      
      message.destroy();
      
      if (xmlRunners.length === 0) {
        message.error('No valid runners found in XML file');
        return;
      }
      
      if (mode === 'replace') {
        localRunnerService.clearAllRunners();
      }
      
      let imported = 0;
      const initialCount = localRunnerService.getAllRunners().length;
      
      xmlRunners.forEach(runnerData => {
        localRunnerService.addRunner(runnerData);
        imported++;
      });
      
      const finalCount = localRunnerService.getAllRunners().length;
      const newRunners = mode === 'merge' ? finalCount - initialCount : imported;
      const updatedRunners = mode === 'merge' ? imported - newRunners : 0;
      
      if (mode === 'merge') {
        message.success(`Merged ${imported} runners: ${newRunners} new, ${updatedRunners} updated`);
      } else {
        message.success(`Replaced database with ${imported} runners from ${file.name}`);
      }
      
      loadRunners(); // Refresh the display
      
    } catch (error) {
      message.destroy();
      console.error('XML import error:', error);
      message.error(`Failed to import XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setXmlImporting(false);
    }
  };

  const handleSyncFromCloud = async () => {
    if (!cloudPath) {
      message.warning('No cloud file path configured. Please set it in Runner Database settings.');
      return;
    }

    try {
      setLoading(true);
      message.loading('Loading from cloud file...', 0);
      
      // Use Electron IPC to read the cloud file
      if (window.electronAPI && window.electronAPI.loadRunnerDatabase) {
        const content = await window.electronAPI.loadRunnerDatabase(cloudPath);
        if (content) {
          const data = JSON.parse(content);
          if (data.runners && Array.isArray(data.runners)) {
            // Update localStorage with cloud data
            localStorage.setItem('local_runner_database', JSON.stringify(data.runners));
            loadRunners();
            message.destroy();
            message.success(`Successfully synced ${data.runners.length} runners from cloud`);
          } else {
            throw new Error('Invalid cloud file format');
          }
        } else {
          throw new Error('Failed to read cloud file');
        }
      } else {
        throw new Error('Electron API not available');
      }
    } catch (error) {
      console.error('[DatabaseManager] Sync failed:', error);
      message.destroy();
      message.error(`Failed to sync from cloud: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter runners based on search
  const filteredRunners = runners.filter(runner => {
    if (!searchText) return true;
    const search = searchText.toLowerCase();
    const fullName = `${runner.name.first} ${runner.name.last}`.toLowerCase();
    return (
      fullName.includes(search) ||
      runner.club.toLowerCase().includes(search) ||
      (runner.phone && runner.phone.includes(search)) ||
      (runner.email && runner.email.toLowerCase().includes(search))
    );
  });

  const columns = [
    {
      title: 'First Name',
      dataIndex: ['name', 'first'],
      key: 'firstName',
      sorter: (a: LocalRunner, b: LocalRunner) => a.name.first.localeCompare(b.name.first),
    },
    {
      title: 'Last Name',
      dataIndex: ['name', 'last'],
      key: 'lastName',
      sorter: (a: LocalRunner, b: LocalRunner) => a.name.last.localeCompare(b.name.last),
    },
    {
      title: 'Club',
      dataIndex: 'club',
      key: 'club',
      sorter: (a: LocalRunner, b: LocalRunner) => a.club.localeCompare(b.club),
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) => phone || <Text type="secondary">—</Text>,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => email || <Text type="secondary">—</Text>,
    },
    {
      title: 'Usage',
      dataIndex: 'timesUsed',
      key: 'timesUsed',
      sorter: (a: LocalRunner, b: LocalRunner) => (a.timesUsed || 0) - (b.timesUsed || 0),
      render: (count: number) => <Tag color={count > 0 ? 'blue' : 'default'}>{count || 0}</Tag>,
    },
    {
      title: 'Last Used',
      dataIndex: 'lastUsed',
      key: 'lastUsed',
      sorter: (a: LocalRunner, b: LocalRunner) => {
        const dateA = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
        const dateB = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
        return dateA - dateB;
      },
      render: (date: Date) => date ? new Date(date).toLocaleDateString() : <Text type="secondary">—</Text>,
    },
  ];

  const hasCloudPath = Boolean(cloudPath);

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', minHeight: '100vh', background: '#f5f5f5' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <Card>
          <Row align="middle" justify="space-between">
            <Col>
              <Title level={2} style={{ marginBottom: 0 }}>
                <DatabaseOutlined /> Runner Database Manager
              </Title>
              <Text type="secondary">
                View and manage the local runner database used across all windows
              </Text>
            </Col>
            <Col>
              <Space>
                <input 
                  type="file" 
                  id="xmlFileInput" 
                  accept=".xml" 
                  style={{display: 'none'}} 
                  onChange={handleXMLImport} 
                />
                <Button 
                  icon={<ImportOutlined />}
                  onClick={() => document.getElementById('xmlFileInput')?.click()}
                  loading={xmlImporting}
                >
                  Import XML
                </Button>
                <Button 
                  icon={<ReloadOutlined />} 
                  onClick={handleRefresh}
                  loading={loading}
                >
                  Refresh
                </Button>
                {hasCloudPath && (
                  <Button
                    type="primary"
                    icon={<CloudDownloadOutlined />}
                    onClick={handleSyncFromCloud}
                    loading={loading}
                  >
                    Sync from Cloud
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </Card>

        {/* Cloud Path Info */}
        {hasCloudPath ? (
          <Alert
            message="Cloud Sync Enabled"
            description={
              <div>
                <Paragraph style={{ marginBottom: 4 }}>
                  <strong>Cloud File:</strong> <Text code>{cloudPath}</Text>
                </Paragraph>
                <Text type="secondary">
                  This database is automatically synced with the cloud file. Click "Sync from Cloud" to pull the latest changes.
                </Text>
              </div>
            }
            type="success"
            icon={<CheckCircleOutlined />}
            showIcon
          />
        ) : (
          <Alert
            message="No Cloud Sync Configured"
            description={
              <div>
                <Paragraph style={{ marginBottom: 8 }}>
                  Cloud path not set. The database is stored only in localStorage. Configure cloud sync to enable automatic backups.
                </Paragraph>
                <Button 
                  type="primary" 
                  icon={<SettingOutlined />} 
                  onClick={handleConfigureCloudPath}
                  size="small"
                >
                  Configure Cloud Sync
                </Button>
              </div>
            }
            type="warning"
            icon={<WarningOutlined />}
            showIcon
          />
        )}

        {/* Statistics */}
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Runners"
                value={stats.total}
                prefix={<UserOutlined />}
                valueStyle={{ color: '#1890ff' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Total Usage Count"
                value={stats.totalUsage}
                prefix={<SyncOutlined />}
                valueStyle={{ color: '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Last Used"
                value={stats.lastUsed ? new Date(stats.lastUsed).toLocaleString() : 'Never'}
                prefix={<FileTextOutlined />}
              />
            </Card>
          </Col>
        </Row>

        {/* Storage Info */}
        <Card title="Storage Information">
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>
              <Text strong>Storage Key: </Text>
              <Text code>local_runner_database</Text>
            </div>
            <div>
              <Text strong>Storage Type: </Text>
              <Text>localStorage (shared across all Electron windows)</Text>
            </div>
            <Divider style={{ margin: '12px 0' }} />
            <Alert
              message="Real-time Sync"
              description="This window automatically updates when runner data changes in other windows (Dashboard, Event Day Operations, etc.). All windows share the same localStorage database."
              type="info"
              showIcon
            />
          </Space>
        </Card>

        {/* Search and Table */}
        <Card
          title={
            <Space>
              <UserOutlined />
              <span>All Runners ({filteredRunners.length})</span>
            </Space>
          }
          extra={
            <Search
              placeholder="Search by name, club, phone, or email"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 300 }}
              allowClear
            />
          }
        >
          <Spin spinning={loading}>
            <Table
              columns={columns}
              dataSource={filteredRunners}
              rowKey={(record) => `${record.name.first}-${record.name.last}-${record.club}`}
              pagination={{
                pageSize: 50,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} runners`,
              }}
              size="small"
            />
          </Spin>
        </Card>
      </Space>

      {/* Cloud Sync Configuration Modal */}
      <Modal
        title="Configure Cloud Sync"
        open={configModalVisible}
        onOk={handleSaveCloudPath}
        onCancel={() => setConfigModalVisible(false)}
        okText="Save"
        cancelText="Cancel"
        width={700}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            message="Cloud Sync Path"
            description="Set the path where the runner database JSON file should be stored and synced. This allows multiple windows and sessions to share the same runner data."
            type="info"
            showIcon
          />
          
          <div>
            <Text strong>Default Path:</Text>
            <br />
            <Text code>C:\Users\drads\OneDrive\DVOA\DVOA MeOS Advanced\runner_database.json</Text>
          </div>

          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="Enter cloud file path"
              value={tempCloudPath}
              onChange={(e) => setTempCloudPath(e.target.value)}
              prefix={<DatabaseOutlined />}
            />
            {window.electronAPI && (
              <Button 
                icon={<EditOutlined />} 
                onClick={handleChooseCloudPath}
                title="Browse for file"
              >
                Browse
              </Button>
            )}
          </Space.Compact>

          {!window.electronAPI && (
            <Alert
              message="Running in Development Mode"
              description={
                <div>
                  <Paragraph style={{ marginBottom: 8 }}>
                    You're running in web development mode. To access full Electron features including file browsing:
                  </Paragraph>
                  <ol style={{ marginBottom: 0, paddingLeft: 20 }}>
                    <li>Stop the current dev server</li>
                    <li>Run: <Text code>npm run electron:dev</Text></li>
                    <li>Wait for the Electron window to open</li>
                  </ol>
                </div>
              }
              type="warning"
              showIcon
            />
          )}
        </Space>
      </Modal>

      {/* XML Import Mode Selection Modal */}
      <Modal
        title="Import XML - Choose Mode"
        open={pendingXmlFile !== null}
        onCancel={() => setPendingXmlFile(null)}
        footer={[
          <Button key="cancel" onClick={() => setPendingXmlFile(null)}>
            Cancel
          </Button>,
          <Button 
            key="merge" 
            type="default" 
            onClick={() => executeXMLImport('merge')}
            style={{ backgroundColor: '#52c41a', color: 'white' }}
          >
            Merge/Sync
          </Button>,
          <Button 
            key="replace" 
            type="primary" 
            danger
            onClick={() => executeXMLImport('replace')}
          >
            Replace All
          </Button>
        ]}
        width={500}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Paragraph>
            <strong>File:</strong> {pendingXmlFile?.name}
          </Paragraph>
          
          <Paragraph>
            How do you want to import this XML file?
          </Paragraph>

          <Card size="small" style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}>
            <Title level={5} style={{ marginTop: 0 }}>
              <ImportOutlined /> Merge/Sync (Recommended)
            </Title>
            <ul style={{ marginBottom: 0 }}>
              <li>Adds new runners from XML</li>
              <li>Updates existing runners with XML data</li>
              <li>Keeps existing runners not in XML</li>
              <li><strong>Safe:</strong> No data loss</li>
            </ul>
          </Card>

          <Card size="small" style={{ backgroundColor: '#fff1f0', borderColor: '#ffccc7' }}>
            <Title level={5} style={{ marginTop: 0, color: '#cf1322' }}>
              ⚠️ Replace All
            </Title>
            <ul style={{ marginBottom: 0 }}>
              <li>Deletes ALL existing runners</li>
              <li>Replaces with only runners from XML</li>
              <li><strong>Warning:</strong> Cannot be undone</li>
            </ul>
          </Card>
        </Space>
      </Modal>
    </div>
  );
};

export default DatabaseManager;
