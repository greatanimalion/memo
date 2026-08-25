import { Outlet } from "react-router-dom";
import Header from "@renderer/components/Header";
import Sidebar from "@renderer/components/Sidebar";
import useAppStore from "@renderer/store/app";
const MainLayout = () => {
  const AppStore=useAppStore()

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {!AppStore.isBookScreen?<Sidebar />:null}
        <Outlet />
      </div>
    </div>
  );
};

export default MainLayout;
