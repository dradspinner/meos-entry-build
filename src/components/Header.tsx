import React, { useState, useEffect } from 'react';
import { Layout, Button, Modal, Typography, Space, Input, Alert, Dropdown, Badge, Tooltip } from 'antd';
import { TrophyOutlined, CopyOutlined, CheckCircleOutlined, FolderOpenOutlined, HomeOutlined, ApiOutlined, PlayCircleOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import logoImage from '../assets/dvoa_logo.png';
import { localEntryService } from '../services/localEntryService';

const { Paragraph, Text, Title } = Typography;

const { Header: AntHeader } = Layout;

interface HeaderProps {
  title?: string;
  onNavigateToMain?: () => void;
}

// Store window reference outside component to persist across renders
let liveResultsWindow: Window | null = null;

const Header: React.FC<HeaderProps> = ({ title = 'MeOS Event Management System', onNavigateToMain }) => {
  const [showPathModal, setShowPathModal] = useState(false);
  const [mipServerRunning, setMipServerRunning] = useState(false);
  const [meosRemoteInputRunning, setMeosRemoteInputRunning] = useState(false);
  const [siReaderConnected, setSiReaderConnected] = useState(false);
  const [siReaderStats, setSiReaderStats] = useState<any>(null);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [showMipModal, setShowMipModal] = useState(false);

  // Check MIP server and MeOS Remote Input status
  const checkMipStatus = async () => {
    if (!(window as any).electronAPI) return;
    
    try {
      // Check MIP server status
      const mipStatus = await (window as any).electronAPI.mipServerStatus();
      setMipServerRunning(mipStatus.success && mipStatus.running);
      setSiReaderConnected(mipStatus.siReaderConnected || false);
      setSiReaderStats(mipStatus.siReaderStatistics || null);
      
      // Check MeOS Remote Input status
      const meosStatus = await (window as any).electronAPI.checkMeOSRemoteInput();
      setMeosRemoteInputRunning(meosStatus.success && meosStatus.running);
    } catch (error) {
      console.error('[Header] Failed to check MIP status:', error);
    }
  };
  
  // Poll status every 10 seconds
  useEffect(() => {
    checkMipStatus();
    const interval = setInterval(checkMipStatus, 10000);
    return () => clearInterval(interval);
  }, []);
  
  const handleStartMipServer = async () => {
    if (!(window as any).electronAPI?.mipServerStart) {
      alert('MIP server control not available in this environment');
      return;
    }
    
    setCheckingStatus(true);
    try {
      const result = await (window as any).electronAPI.mipServerStart({ port: 8099, competitionId: 0 });
      if (result.success) {
        await checkMipStatus();
      } else {
        alert(`Failed to start MIP server: ${result.error}`);
      }
    } catch (error) {
      console.error('[Header] Failed to start MIP server:', error);
      alert('Failed to start MIP server');
    } finally {
      setCheckingStatus(false);
    }
  };
  
  const handleStopMipServer = async () => {
    if (!(window as any).electronAPI?.mipServerStop) return;
    
    setCheckingStatus(true);
    try {
      const result = await (window as any).electronAPI.mipServerStop();
      if (result.success) {
        await checkMipStatus();
      } else {
        alert(`Failed to stop MIP server: ${result.error}`);
      }
    } catch (error) {
      console.error('[Header] Failed to stop MIP server:', error);
    } finally {
      setCheckingStatus(false);
    }
  };
  
  const handleOpenMipModal = () => {
    setShowMipModal(true);
    checkMipStatus();
  };
  
  const handleOpenLiveResults = async () => {
    // Check if MeOS API is running
    try {
      const response = await fetch('http://localhost:2009/meos?get=competition', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      
      if (response.ok) {
        // API is running, open live results directly
        openLiveResultsWindow();
      } else {
        // API returned error
        setShowPathModal(true);
      }
    } catch (error) {
      // API is not running
      setShowPathModal(true);
    }
  };
  
  
  const openLiveResultsWindow = async () => {
    console.log('🏆 Opening Live Results Display...');
    
    // Check if running in Electron
    if ((window as any).electronAPI?.openLiveResults) {
      // Use Electron IPC to open in new window
      try {
        await (window as any).electronAPI.openLiveResults();
      } catch (error) {
        console.error('[Header] Failed to open live results window:', error);
      }
    } else {
      // Fallback for web browser (dev mode)
      const liveResultsUrl = window.location.origin + '/live_results.html';
      
      // Check if window is still open
      if (liveResultsWindow && !liveResultsWindow.closed) {
        // Window already exists - just focus it
        try {
          liveResultsWindow.focus();
        } catch (e) {
          liveResultsWindow = null;
        }
        return;
      }
      
      // Open new window
      liveResultsWindow = window.open(liveResultsUrl, 'live-results');
    }
  };
  
  const handleContinueToLiveResults = () => {
    setShowPathModal(false);
    openLiveResultsWindow();
  };
  


  return (
    <AntHeader style={{ 
      background: '#fff', 
      padding: '0 24px', 
      borderBottom: '1px solid #e8e8e8',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '80px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <img 
          src={logoImage} 
          alt="DVOA Logo" 
          style={{ height: '60px', marginRight: '20px' }}
        />
        <h1 style={{ 
          margin: 0, 
          fontSize: '24px', 
          fontWeight: '600',
          color: '#1890ff'
        }}>
          {title}
        </h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {onNavigateToMain && (
          <Dropdown
            menu={{
              items: [
                {
                  key: 'main-dashboard',
                  icon: <HomeOutlined />,
                  label: 'Main Dashboard',
                  onClick: onNavigateToMain,
                },
              ],
            }}
            placement="bottomLeft"
          >
            <Button size="large">
              Event
            </Button>
          </Dropdown>
        )}
        <Tooltip title="Radio Control Start Server Status">
          <Badge 
            status={mipServerRunning ? 'success' : 'default'} 
            dot
          >
            <Button 
              icon={<ApiOutlined />} 
              size="large"
              onClick={handleOpenMipModal}
              title="Radio Control Start Server"
            >
              Radio Start
            </Button>
          </Badge>
        </Tooltip>
        <Button 
          icon={<TrophyOutlined />} 
          type="primary" 
          size="large"
          onClick={handleOpenLiveResults}
          title="Open Live Results in New Window"
          style={{ background: '#52c41a', borderColor: '#52c41a' }}
        >
          Live Results
        </Button>
        
        <div style={{ 
          fontSize: '14px', 
          color: '#666',
          textAlign: 'right'
        }}>
          <div>Delaware Valley Orienteering Association</div>
          <div>Event Management System</div>
        </div>
      </div>
      
      {/* MeOS API Check Modal */}
      <Modal
        title={<><TrophyOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />MeOS API Not Running</>}
        open={showPathModal}
        onOk={handleContinueToLiveResults}
        onCancel={() => setShowPathModal(false)}
        okText="Try Again"
        cancelText="Cancel"
        width={600}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            message="Cannot Connect to MeOS API"
            description="The MeOS API server is not running on localhost:2009. Live Results needs this API to fetch real-time data."
            type="error"
            showIcon
          />
          
          <div>
            <Title level={5}>How to Start MeOS API Server</Title>
            <Paragraph>
              To use Live Results, you need to start the MeOS API server:
            </Paragraph>
            <ol style={{ paddingLeft: 20 }}>
              <li>Open <strong>MeOS</strong></li>
              <li>Load your event</li>
              <li>Go to <strong>Tools → Web Server</strong> or <strong>Settings → API</strong></li>
              <li>Start the API server on port <Text code>2009</Text></li>
              <li>Click <strong>"Try Again"</strong> below to reconnect</li>
            </ol>
          </div>
          
          <Alert
            message="Note"
            description="The API server must remain running while you use Live Results."
            type="info"
            showIcon
          />
        </Space>
      </Modal>
      
      {/* MIP Server Control Modal */}
      <Modal
        title={<><ApiOutlined style={{ marginRight: 8, color: '#1890ff' }} />Radio Control Start Server</>}
        open={showMipModal}
        onCancel={() => setShowMipModal(false)}
        footer={[
          <Button key="close" onClick={() => setShowMipModal(false)}>
            Close
          </Button>,
          <Button 
            key="refresh" 
            icon={<SyncOutlined spin={checkingStatus} />}
            onClick={checkMipStatus}
            loading={checkingStatus}
          >
            Refresh Status
          </Button>
        ]}
        width={600}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={5}>MIP Server Status</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text>Server Status:</Text>
                <Space>
                  <Badge 
                    status={mipServerRunning ? 'success' : 'error'} 
                    text={mipServerRunning ? 'Running' : 'Not Running'}
                  />
                  {!mipServerRunning ? (
                    <Button 
                      type="primary"
                      size="small"
                      icon={<PlayCircleOutlined />}
                      onClick={handleStartMipServer}
                      loading={checkingStatus}
                    >
                      Start Server
                    </Button>
                  ) : (
                    <Button 
                      danger
                      size="small"
                      icon={<StopOutlined />}
                      onClick={handleStopMipServer}
                      loading={checkingStatus}
                    >
                      Stop Server
                    </Button>
                  )}
                </Space>
              </div>
              {mipServerRunning && (
                <Alert
                  message="MIP Server Running"
                  description="Server is listening on http://localhost:8099/mip"
                  type="success"
                  showIcon
                />
              )}
            </Space>
          </div>
          
          <div>
            <Title level={5}>SportIdent Dongle</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text>Dongle Status:</Text>
                <Badge 
                  status={siReaderConnected ? 'success' : 'error'} 
                  text={siReaderConnected ? 'Connected' : 'Not Connected'}
                />
              </div>
              {siReaderConnected && siReaderStats && (
                <div>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    Punches received: {siReaderStats.punchesReceived || 0}
                  </Text>
                </div>
              )}
              {!siReaderConnected && mipServerRunning && (
                <Alert
                  message="No SportIdent Dongle"
                  description="MIP server is running but no SportIdent SRR dongle detected. Connect an SRR dongle and restart the server to receive radio punches."
                  type="warning"
                  showIcon
                />
              )}
            </Space>
          </div>
          
          <div>
            <Title level={5}>MeOS Remote Input Service</Title>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text>Connection Status:</Text>
                <Badge 
                  status={meosRemoteInputRunning ? 'processing' : 'default'} 
                  text={meosRemoteInputRunning ? 'Connected' : 'Not Connected'}
                />
              </div>
              {!meosRemoteInputRunning && mipServerRunning && (
                <Alert
                  message="MeOS Not Polling"
                  description={
                    <div>
                      <p>MeOS is not currently polling the MIP server.</p>
                      <p><strong>To connect MeOS:</strong></p>
                      <ol style={{ paddingLeft: 20, margin: '8px 0' }}>
                        <li>Open MeOS and load your event</li>
                        <li>Go to <Text code>Competition → Automatic tasks → Onlineinput</Text></li>
                        <li>Set URL: <Text code>http://localhost:8099/mip</Text></li>
                        <li>Set Competition ID: <Text code>0</Text> (or your competition ID)</li>
                        <li>Set Interval: <Text code>10-15 seconds</Text></li>
                        <li>Click <Text strong>"Start"</Text></li>
                      </ol>
                    </div>
                  }
                  type="info"
                  showIcon
                />
              )}
              {meosRemoteInputRunning && (
                <Alert
                  message="MeOS Connected"
                  description="MeOS is successfully polling the MIP server for radio punch data."
                  type="success"
                  showIcon
                />
              )}
            </Space>
          </div>
          
          <Alert
            message="About Radio Control Start"
            description="The MIP server receives radio punch data from SportIdent wireless controls and makes it available to MeOS via the MeOS Input Protocol. This enables real-time start time recording from radio controls in the forest."
            type="info"
          />
        </Space>
      </Modal>
    </AntHeader>
  );
};

export default Header;
