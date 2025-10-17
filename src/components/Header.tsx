import React from 'react';
import { Layout } from 'antd';
import logoImage from '../assets/dvoa_logo.png';

const { Header: AntHeader } = Layout;

interface HeaderProps {
  title?: string;
}

const Header: React.FC<HeaderProps> = ({ title = 'MeOS Event Management System' }) => {
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
      <div style={{ 
        fontSize: '14px', 
        color: '#666',
        textAlign: 'right'
      }}>
        <div>Delaware Valley Orienteering Association</div>
        <div>Event Management System</div>
      </div>
    </AntHeader>
  );
};

export default Header;