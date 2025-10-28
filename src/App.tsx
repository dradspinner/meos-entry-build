import { useState, useEffect } from 'react';
import { Layout, ConfigProvider } from 'antd';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import EventBuilder from './components/EventBuilder';
import EventDayOps from './components/EventDayOps';
import EventDayHome from './components/EventDayHome';
import DatabaseManager from './components/DatabaseManager';
import LiveResultsDisplay from './components/LiveResultsDisplay';
import ResultsExport from './components/ResultsExport';
import Tools from './components/Tools';
import DatabaseCleanupSQLite from './components/DatabaseCleanupSQLite';
import './styles/professional.css';

type CurrentView = 'dashboard' | 'eventBuilder' | 'eventDayOps' | 'eventDayDashboard' | 'databaseManager' | 'liveResults' | 'resultsExport' | 'tools' | 'databaseCleanup';

function App() {
  const [currentView, setCurrentView] = useState<CurrentView>('dashboard');

  // SQLite database is now initialized on-demand when accessed

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

  // Handle Electron menu events
  useEffect(() => {
    // Listen for SQL Converter menu item
    const handleMenuSqlConverter = () => {
      console.log('[App] Opening SQL Converter from menu...');
      setCurrentView('tools');
    };

    // Listen for Database Cleanup menu item
    const handleMenuDatabaseCleanup = () => {
      console.log('[App] Opening Database Cleanup from menu...');
      setCurrentView('databaseCleanup');
    };

    // Check if we're in Electron environment
    // Use electronAPI with proper TypeScript support
    if (window.electronAPI) {
      const cleanupSqlConverter = window.electronAPI.onMenuEvent('menu-open-sql-converter', handleMenuSqlConverter);
      const cleanupDatabaseCleanup = window.electronAPI.onMenuEvent('menu-open-database-cleanup', handleMenuDatabaseCleanup);
      
      return () => {
        cleanupSqlConverter();
        cleanupDatabaseCleanup();
      };
    }
    // Fallback to window.electron for backward compatibility (with type safety issues)
    else if (window.electron && (window.electron as any).on) {
      (window.electron as any).on('menu-open-sql-converter', handleMenuSqlConverter);
      (window.electron as any).on('menu-open-database-cleanup', handleMenuDatabaseCleanup);
      
      return () => {
        if ((window.electron as any).removeListener) {
          (window.electron as any).removeListener('menu-open-sql-converter', handleMenuSqlConverter);
          (window.electron as any).removeListener('menu-open-database-cleanup', handleMenuDatabaseCleanup);
        }
      };
    }
  }, []);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <Dashboard
            onNavigateToEventBuilder={() => setCurrentView('eventBuilder')}
            onNavigateToEventDayOps={() => setCurrentView('eventDayOps')}
            onNavigateToResultsExport={() => setCurrentView('resultsExport')}
            onNavigateToTools={() => setCurrentView('tools')}
            onNavigateToDatabaseCleanup={() => setCurrentView('databaseCleanup')}
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
              onBackToMain={() => setCurrentView('dashboard')}
            />
          </div>
        );
      case 'databaseManager':
        return <DatabaseManager />;
      case 'liveResults':
        return <LiveResultsDisplay />;
      case 'resultsExport':
        return <ResultsExport />;
      case 'tools':
        return <Tools onBack={() => setCurrentView('dashboard')} />;
      case 'databaseCleanup':
        return <DatabaseCleanupSQLite onBack={() => setCurrentView('dashboard')} />;
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
        {currentView !== 'eventDayDashboard' && (
          <Header 
            title={currentView === 'eventBuilder' ? 'Event Builder' : 'MeOS Event Management System'} 
            onNavigateToMain={currentView !== 'dashboard' ? () => setCurrentView('dashboard') : undefined}
          />
        )}
        <Layout.Content style={{ background: '#f5f5f5', padding: currentView === 'eventDayDashboard' ? '0' : undefined }}>
          {renderCurrentView()}
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  );
}

export default App;