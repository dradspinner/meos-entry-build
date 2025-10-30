import { useState, useEffect, lazy, Suspense } from 'react';
import { Layout, ConfigProvider, Spin } from 'antd';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import './styles/professional.css';

// Lazy load heavy components
const EventBuilder = lazy(() => import('./components/EventBuilder'));
const EventDayOps = lazy(() => import('./components/EventDayOps'));
const EventDayHome = lazy(() => import('./components/EventDayHome'));
const DatabaseManager = lazy(() => import('./components/DatabaseManager'));
const LiveResultsDisplay = lazy(() => import('./components/LiveResultsDisplay'));
const ResultsExport = lazy(() => import('./components/ResultsExport'));
const Tools = lazy(() => import('./components/Tools'));
const DatabaseCleanupSQLite = lazy(() => import('./components/DatabaseCleanupSQLite'));

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
      setCurrentView('tools');
    };

    // Listen for Database Cleanup menu item
    const handleMenuDatabaseCleanup = () => {
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
    const content = (() => {
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
    })();

    // Wrap lazy-loaded components in Suspense
    if (currentView !== 'dashboard') {
      return (
        <Suspense fallback={
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <Spin size="large" tip="Loading..." />
          </div>
        }>
          {content}
        </Suspense>
      );
    }

    return content;
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