// Dashboard Component for MeOS Entry Build

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Typography, Space, Alert, Badge } from 'antd';
import {
  UserAddOutlined,
  UserOutlined,
  DashboardOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { meosApi } from '../services/meosApi';
import { localEntryService } from '../services/localEntryService';
import JotformImport from './JotformImport';
import EventDayDashboard from './EventDayDashboard_with_hired_cards';
import { RunnerDatabase } from './RunnerDatabase';

const { Title, Text } = Typography;

interface DashboardStats {
  totalEntries: number;
  cardsNeeded: number;
  checkedIn: number;
  needsFixes: number;
  meosConnectionStatus: 'connected' | 'disconnected' | 'checking';
}

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalEntries: 0,
    cardsNeeded: 0,
    checkedIn: 0,
    needsFixes: 0,
    meosConnectionStatus: 'checking',
  });

  const [loading, setLoading] = useState(false);
  const [eventName, setEventName] = useState<string>('MeOS Event');
  const [connectionDetails, setConnectionDetails] = useState<string>('');
  const [currentView, setCurrentView] = useState<'dashboard' | 'jotform-import' | 'event-day-dashboard' | 'runner-database'>('dashboard');

  useEffect(() => {
    checkMeosConnection();
  }, []);
  
  // Also load stats independently to ensure they show up
  useEffect(() => {
    const loadInitialStats = () => {
      try {
        const localStats = localEntryService.getLocalStats();
        setStats(prevStats => ({
          ...prevStats,
          totalEntries: localStats.totalEntries,
          cardsNeeded: localStats.cardsNeeded || 0,
          checkedIn: localStats.checkedInEntries,
          needsFixes: localStats.hasIssues,
        }));
      } catch (error) {
        console.error('Error loading initial stats:', error);
      }
    };
    
    loadInitialStats();
  }, []);


  const checkMeosConnection = async () => {
    setLoading(true);
    setStats(prev => ({ ...prev, meosConnectionStatus: 'checking' }));
    setConnectionDetails('');
    
    try {
      console.log('Testing MeOS connection to:', meosApi.getConfig().baseUrl);
      const isConnected = await meosApi.testConnection();
      
      // Load local statistics regardless of connection status
      let localStats;
      try {
        localStats = localEntryService.getLocalStats(); // This is sync, not async
      } catch (statsError) {
        console.error('Error loading local stats:', statsError);
        localStats = {
          totalEntries: 0,
          readyEntries: 0,
          checkedInEntries: 0,
          hasIssues: 0
        };
      }
      
      let currentEventName = 'MeOS Event';
      
      if (isConnected) {
        setConnectionDetails('Successfully connected to MeOS REST API');
        
        // Try to get competition info and event name
        try {
          const competition = await meosApi.getCompetition();
          if (competition) {
            currentEventName = competition.name || 'MeOS Event';
            setConnectionDetails(`Connected to event: "${competition.name}" (${competition.date})`);
          }
        } catch (compError) {
          console.warn('Could not fetch competition details:', compError);
        }
      } else {
        setConnectionDetails(
          `Cannot connect to MeOS at ${meosApi.getConfig().baseUrl}. ` +
          'Please ensure MeOS is running with REST API enabled on port 2009.'
        );
      }
      
      // Update state with connection status, event name, and stats
      setEventName(currentEventName);
      setStats(prev => ({
        ...prev,
        totalEntries: localStats.totalEntries,
        cardsNeeded: localStats.cardsNeeded || 0,
        checkedIn: localStats.checkedInEntries,
        needsFixes: localStats.hasIssues,
        meosConnectionStatus: isConnected ? 'connected' : 'disconnected'
      }));
      
    } catch (error: any) {
      console.error('Connection test failed:', error);
      
      // Still try to load local stats on error
      let localStats;
      try {
        localStats = localEntryService.getLocalStats(); // This is sync, not async
      } catch (statsError) {
        localStats = {
          totalEntries: 0,
          readyEntries: 0,
          checkedInEntries: 0,
          hasIssues: 0
        };
      }
      
      setStats(prev => ({
        ...prev,
        totalEntries: localStats.totalEntries,
        cardsNeeded: localStats.cardsNeeded || 0,
        checkedIn: localStats.checkedInEntries,
        needsFixes: localStats.hasIssues,
        meosConnectionStatus: 'disconnected'
      }));
      
      let errorMessage = 'Connection failed: ';
      if (error.message?.includes('HTML instead of XML')) {
        errorMessage = 
          '⚠️ MeOS Information Server is running, but REST API is not enabled. ' +
          'Please enable the REST API service in MeOS (separate from Information Server).';
      } else if (error.message?.includes('NETWORK_ERROR') || error.code === 'NETWORK_ERROR') {
        errorMessage += 'Network error - MeOS is not running or REST API is disabled.';
      } else if (error.message?.includes('timeout')) {
        errorMessage += 'Connection timeout - MeOS may be slow to respond.';
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      
      setConnectionDetails(errorMessage);
    }
    
    setLoading(false);
  };

  const getConnectionStatus = () => {
    switch (stats.meosConnectionStatus) {
      case 'connected':
        return {
          status: 'success' as const,
          icon: <CheckCircleOutlined />,
          text: 'Connected to MeOS',
          color: '#52c41a',
        };
      case 'disconnected':
        return {
          status: 'error' as const,
          icon: <ExclamationCircleOutlined />,
          text: 'Disconnected from MeOS',
          color: '#ff4d4f',
        };
      case 'checking':
        return {
          status: 'warning' as const,
          icon: <SyncOutlined spin />,
          text: 'Checking connection...',
          color: '#faad14',
        };
    }
  };


  const connectionInfo = getConnectionStatus();
  

  // Render different views
  if (currentView === 'jotform-import') {
    return (
      <div>
        <div style={{ padding: '24px', paddingBottom: '12px' }}>
          <Button 
            onClick={() => {
              setCurrentView('dashboard');
              // Refresh dashboard stats when returning from import
              setTimeout(() => checkMeosConnection(), 100);
            }}
            style={{ marginBottom: '16px' }}
          >
            ← Back to Dashboard
          </Button>
        </div>
        <JotformImport />
      </div>
    );
  }

  if (currentView === 'event-day-dashboard') {
    return (
      <div>
        <div style={{ padding: '24px', paddingBottom: '12px' }}>
          <Button 
            onClick={() => {
              setCurrentView('dashboard');
              // Refresh dashboard stats when returning
              setTimeout(() => checkMeosConnection(), 100);
            }}
            style={{ marginBottom: '16px' }}
          >
            ← Back to Dashboard
          </Button>
        </div>
        <EventDayDashboard key="event-day-dashboard" />
      </div>
    );
  }


  if (currentView === 'runner-database') {
    return (
      <div>
        <div style={{ padding: '24px', paddingBottom: '12px' }}>
          <Button 
            onClick={() => {
              setCurrentView('dashboard');
              // Refresh dashboard stats when returning
              setTimeout(() => checkMeosConnection(), 100);
            }}
            style={{ marginBottom: '16px' }}
          >
            ← Back to Dashboard
          </Button>
        </div>
        <RunnerDatabase />
      </div>
    );
  }

  const handleNewRegistration = () => {
    console.log('New registration clicked');
    setCurrentView('jotform-import');
  };

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: '24px' }}>
        <Col>
          <Title level={2}>
            <DashboardOutlined /> {eventName}
          </Title>
          <Text type="secondary">MeOS Entry Management - Event day registration and management</Text>
        </Col>
        <Col>
          <Space>
            <Badge 
              status={connectionInfo.status} 
              text={connectionInfo.text}
            />
            <Button 
              icon={<SyncOutlined />} 
              onClick={() => {
                checkMeosConnection();
              }}
              loading={loading}
              size="small"
            >
              Refresh
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Connection Status Alert */}
      {stats.meosConnectionStatus !== 'connected' && (
        <Alert
          message="MeOS Connection Status"
          description={
            connectionDetails || (
              stats.meosConnectionStatus === 'disconnected' 
                ? "Cannot connect to MeOS. Make sure MeOS is running with REST service enabled."
                : "Checking connection to MeOS..."
            )
          }
          type={connectionInfo.status}
          showIcon
          style={{ marginBottom: '24px' }}
        />
      )}


      {/* Quick Actions */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Button
              type="primary"
              size="large"
              icon={<DashboardOutlined />}
              onClick={() => {
                console.log('[Dashboard] Navigating to Event Day Dashboard');
                setCurrentView('event-day-dashboard');
              }}
              block
              style={{ height: '60px', fontSize: '16px' }}
            >
              Event Day
            </Button>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Button
              size="large"
              icon={<UserAddOutlined />}
              onClick={handleNewRegistration}
              block
              style={{ 
                height: '60px', 
                fontSize: '16px', 
                backgroundColor: '#52c41a', 
                borderColor: '#52c41a', 
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#73d13d';
                e.currentTarget.style.borderColor = '#73d13d';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#52c41a';
                e.currentTarget.style.borderColor = '#52c41a';
              }}
            >
              Import CSV
            </Button>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Button
              size="large"
              icon={<UserOutlined />}
              onClick={() => setCurrentView('runner-database')}
              block
              style={{ 
                height: '60px', 
                fontSize: '16px', 
                backgroundColor: '#722ed1', 
                borderColor: '#722ed1', 
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#9254de';
                e.currentTarget.style.borderColor = '#9254de';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#722ed1';
                e.currentTarget.style.borderColor = '#722ed1';
              }}
            >
              Runner Database
            </Button>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable>
            <Button
              size="large"
              icon={<PlusOutlined />}
              onClick={() => {
                if (window.confirm('Start a new event? This will clear the local database.')) {
                  localEntryService.clearAllEntries();
                  window.location.reload();
                }
              }}
              block
              style={{ 
                height: '60px', 
                fontSize: '16px', 
                backgroundColor: '#fa8c16', 
                borderColor: '#fa8c16', 
                color: 'white'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#ffa940';
                e.currentTarget.style.borderColor = '#ffa940';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#fa8c16';
                e.currentTarget.style.borderColor = '#fa8c16';
              }}
            >
              New Event
            </Button>
          </Card>
        </Col>
      </Row>

      {/* Statistics Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ color: '#1890ff', margin: 0 }}>
                {stats.totalEntries}
              </Title>
              <Text type="secondary">Total Entries</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ color: '#52c41a', margin: 0 }}>
                {stats.cardsNeeded}
              </Title>
              <Text type="secondary">Cards Needed</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ color: '#13c2c2', margin: 0 }}>
                {stats.checkedIn}
              </Title>
              <Text type="secondary">Checked In</Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ color: '#faad14', margin: 0 }}>
                {stats.needsFixes}
              </Title>
              <Text type="secondary">Need Fixes</Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* MeOS Setup Instructions */}
      {stats.meosConnectionStatus !== 'connected' && (
        <Card 
          title="🔧 MeOS Setup Instructions" 
          style={{ marginTop: '24px' }}
          type="inner"
        >
          <div style={{ marginBottom: '16px' }}>
            <Text strong>To connect to MeOS, please follow these steps:</Text>
          </div>
          <ol style={{ paddingLeft: '20px', marginBottom: '16px' }}>
            <li><Text>Open MeOS on this computer</Text></li>
            <li><Text>Open or create your event file (.meos)</Text></li>
            <li><Text>Enable <strong>both</strong> services in MeOS:</Text>
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                <li><Text>✅ <strong>Information Server</strong> (you have this running)</Text></li>
                <li><Text>🔧 <strong>REST API Service</strong> (this is what we need)</Text></li>
              </ul>
            </li>
            <li><Text>Look for REST API settings:</Text>
              <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
                <li><Text code>Tools → Options → REST API</Text></li>
                <li><Text code>Services → Enable REST Server</Text></li>
                <li><Text code>Web Services → API Host</Text></li>
                <li><Text code>Information Server → Enable API</Text></li>
              </ul>
            </li>
            <li><Text>Click the "Refresh" button above to test the connection</Text></li>
          </ol>
          <div>
            <Text type="secondary">
              💡 You can test the connection manually by opening 
              <Text code>http://localhost:2009/meos</Text> in your web browser. 
              You should see XML data if MeOS REST API is working.
            </Text>
          </div>
        </Card>
      )}


      {/* Development Info */}
      <Card 
        title="Development Information" 
        style={{ marginTop: '24px' }}
        type="inner"
      >
        <Row gutter={[16, 8]}>
          <Col span={12}>
            <Text strong>MeOS API URL:</Text>
          </Col>
          <Col span={12}>
            <Text code>{meosApi.getConfig().baseUrl}</Text>
          </Col>
          <Col span={12}>
            <Text strong>API Timeout:</Text>
          </Col>
          <Col span={12}>
            <Text>{meosApi.getConfig().timeout}ms</Text>
          </Col>
          <Col span={12}>
            <Text strong>Retry Attempts:</Text>
          </Col>
          <Col span={12}>
            <Text>{meosApi.getConfig().retryAttempts}</Text>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default Dashboard;