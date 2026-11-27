import { Outlet } from "react-router-dom";
import Header from "@renderer/components/Header";
import Sidebar from "@renderer/components/Sidebar";
import useAppStore from "@renderer/store/app";
import { ConfigProvider } from "antd";
import { useRef } from "react";
const MainLayout = () => {
  const AppStore = useAppStore()
  const contentRef = useRef(null);
  return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
        <Header />
        <div className="flex flex-1 overflow-hidden">
          {!AppStore.isBookScreen ? <Sidebar /> : null}
          <main ref={contentRef} className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
            <Outlet />
          </main>
        </div>
      </div>
  );
};

export default MainLayout;
