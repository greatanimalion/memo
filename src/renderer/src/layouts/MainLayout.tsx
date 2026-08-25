import { Outlet } from "react-router-dom";
import Header from "@renderer/components/Header";
import Sidebar from "@renderer/components/Sidebar";
import useAppStore from "@renderer/store/app";
const MainLayout = () => {
  const AppStore=useAppStore()

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden text-black">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {!AppStore.isBookScreen?<Sidebar />:null}
        <Outlet />
      </div>
    </div>
  );
};

export default MainLayout;
