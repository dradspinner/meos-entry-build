import { useState, useEffect } from 'react';
import { Layout, ConfigProvider } from 'antd';
import { localRunnerService } from './services/localRunnerService';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import EventBuilder from './components/EventBuilder';
import EventDayOps from './components/EventDayOps';
import EventDayHome from './components/EventDayHome';
import DatabaseManager from './components/DatabaseManager';
import LiveResultsDisplay from './components/LiveResultsDisplay';
import ResultsExport from './components/ResultsExport';
import './styles/professional.css';

type CurrentView = 'dashboard' | 'eventBuilder' | 'eventDayOps' | 'eventDayDashboard' | 'databaseManager' | 'liveResults' | 'resultsExport';

function App() {
  const [currentView, setCurrentView] = useState<CurrentView>('dashboard');

  // Initialize app and refresh runner database
  useEffect(() => {
    // Refresh runner database on app startup to ensure latest data
    localRunnerService.refreshFromStorage();
    const stats = localRunnerService.getStats();
    console.log(`[App] Initial runner database refresh: ${stats.total} runners loaded`);
  }, []);

  // Handle hash-based routing for separate windows
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove '#'
      if (hash === '/database-manager') {
        setCurrentView('databaseManager');
      } else if (hash === '/live-results') {
        setCurrentView('liveResults');
      }
    };
    
    // Check initial hash
    handleHashChange();
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToEventBuilder={() => setCurrentView('eventBuilder')}
            onNavigateToEventDayOps={() => setCurrentView('eventDayOps')}
            onNavigateToResultsExport={() => setCurrentView('resultsExport')}
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
          <div style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
            <EventDayHome 
              onBack={() => setCurrentView('eventDayOps')}
            />
          </div>
        );
      case 'databaseManager':
        return <DatabaseManager />;
      case 'liveResults':
        return <LiveResultsDisplay />;
      case 'resultsExport':
        return <ResultsExport />;
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
        {currentView !== 'eventDayDashboard' && <Header title={currentView === 'eventBuilder' ? 'Event Builder' : 'MeOS Event Management System'} />}
        <Layout.Content style={{ background: '#f5f5f5', padding: currentView === 'eventDayDashboard' ? '0' : undefined }}>
          {renderCurrentView()}
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}

export default App;