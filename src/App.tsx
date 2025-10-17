import { useState } from 'react';
import { Layout, ConfigProvider } from 'antd';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import EventBuilder from './components/EventBuilder';
import EventDayOps from './components/EventDayOps';
import EventDayHome from './components/EventDayHome';
import EventDayCheckInPage from './components/EventDayCheckInPage';
import SameDayRegistrationPage from './components/SameDayRegistrationPage';
import './styles/professional.css';

type CurrentView = 'dashboard' | 'eventBuilder' | 'eventDayOps' | 'eventDayDashboard' | 'eventDayCheckIn' | 'sameDayReg';

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
            onOpenCheckIn={() => setCurrentView('eventDayCheckIn')}
            onOpenSameDay={() => setCurrentView('sameDayReg')}
          />
        );
      case 'eventDayCheckIn':
        return (
          <EventDayCheckInPage onBack={() => setCurrentView('eventDayDashboard')} />
        );
      case 'sameDayReg':
        return (
          <SameDayRegistrationPage onBack={() => setCurrentView('eventDayDashboard')} />
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