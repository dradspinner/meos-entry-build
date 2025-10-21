import React from 'react';
import { Layout, Button, message } from 'antd';
import { TrophyOutlined } from '@ant-design/icons';
import logoImage from '../assets/dvoa_logo.png';

const { Header: AntHeader } = Layout;

interface HeaderProps {
  title?: string;
}

// Store window reference outside component to persist across renders
let liveResultsWindow: Window | null = null;

const Header: React.FC<HeaderProps> = ({ title = 'MeOS Event Management System' }) => {

  const handleOpenLiveResults = () => {
    // Open live results in a new window/tab
    // Note: The Python server is automatically started by the Electron app
    const liveResultsUrl = window.location.origin + '/live_results.html';
    
    // Check if window is still open
    if (liveResultsWindow && !liveResultsWindow.closed) {
      // Window already exists - just focus it, DON'T reopen
      try {
        liveResultsWindow.focus();
      } catch (e) {
        // Window may have been closed, try opening again
        liveResultsWindow = null;
      }
      return;
    }
    
    // Open new window only if not already open
    // Using named window without size parameters to preserve position
    liveResultsWindow = window.open(liveResultsUrl, 'live-results');
    message.info('Opening Live Results Display...');
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
    </AntHeader>
  );
};

export default Header;