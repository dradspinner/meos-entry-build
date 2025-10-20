import { useState, useEffect } from 'react';
import { Layout, ConfigProvider } from 'antd';
import { localRunnerService } from './services/localRunnerService';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import EventBuilder from './components/EventBuilder';
import EventDayOps from './components/EventDayOps';
import EventDayHome from './components/EventDayHome';
import './styles/professional.css';

type CurrentView = 'dashboard' | 'eventBuilder' | 'eventDayOps' | 'eventDayDashboard';

function App() {
  const [currentView, setCurrentView] = useState<CurrentView>('dashboard');

  // Refresh runner database on app startup to ensure latest data
  useEffect(() => {
    localRunnerService.refreshFromStorage();
    const stats = localRunnerService.getStats();
    console.log(`[App] Initial runner database refresh: ${stats.total} runners loaded`);
  }, []);

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
        return (
          <EventDayOps 
            onBack={() => setCurrentView('dashboard')} 
            onOpenDayDashboard={() => setCurrentView('eventDayDashboard')} 
          />
        );
      case 'eventDayDashboard':
        return (
          <EventDayHome 
            onBack={() => setCurrentView('eventDayOps')}
          />
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