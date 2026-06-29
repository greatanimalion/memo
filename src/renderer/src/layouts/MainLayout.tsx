import { Component, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <h2 className="text-xl font-bold mb-2">页面出错了</h2>
            <p>请刷新页面重试</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const MainLayout = () => {
  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden text-black">
      <Header />
      <div className="flex flex-1 overflow-hidden">
           <Sidebar />
          <ErrorBoundary><Outlet /></ErrorBoundary>
      </div>
    </div>
  );
};

export default MainLayout;
