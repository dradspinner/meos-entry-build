import { useState } from 'react';
import { Layout, ConfigProvider } from 'antd';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import EventBuilder from './components/EventBuilder';
import './styles/professional.css';

type CurrentView = 'dashboard' | 'eventBuilder' | 'eventDayOps';

function App() {
  const [currentView, setCurrentView] = useState<CurrentView>('dashboard');

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToEventBuilder={() => setCurrentView('eventBuilder')}
            onNavigateToEventDayOps={() => setCurrentView('eventDayOps')}
          />
        );
      case 'eventBuilder':
        return (
          <EventBuilder onBack={() => setCurrentView('dashboard')} />
        );
      case 'eventDayOps':
        // Placeholder for future Event Day Operations component
        return (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <h2>Event Day Operations</h2>
            <p>Coming soon in Phase 2</p>
            <button onClick={() => setCurrentView('dashboard')}>Back to Dashboard</button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
        <Header title={currentView === 'eventBuilder' ? 'Event Builder' : 'MeOS Event Management System'} />
        <Layout.Content style={{ background: '#f5f5f5' }}>
          {renderCurrentView()}
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}

export default App;