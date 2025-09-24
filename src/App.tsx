import { ConfigProvider, App as AntdApp } from 'antd';
import Dashboard from './components/Dashboard';
import './App.css';

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          // Customize Ant Design theme here
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
      }}
    >
      <AntdApp>
        <div className="App">
          <Dashboard />
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
