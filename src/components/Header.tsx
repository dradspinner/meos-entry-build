import React, { useState } from 'react';
import { Layout, Button, Modal, Typography, Space, Input, Alert } from 'antd';
import { TrophyOutlined, CopyOutlined, CheckCircleOutlined, FolderOpenOutlined } from '@ant-design/icons';
import logoImage from '../assets/dvoa_logo.png';
import { localEntryService } from '../services/localEntryService';

const { Paragraph, Text, Title } = Typography;

const { Header: AntHeader } = Layout;

interface HeaderProps {
  title?: string;
}

// Store window reference outside component to persist across renders
let liveResultsWindow: Window | null = null;

const Header: React.FC<HeaderProps> = ({ title = 'MeOS Event Management System' }) => {
  const [showPathModal, setShowPathModal] = useState(false);

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
  
  
  const openLiveResultsWindow = () => {
    // Open live results in a new window (uses live_results_api.js)
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
    console.log('🏆 Opening Live Results Display...');
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
    </AntHeader>
  );
};

export default Header;
