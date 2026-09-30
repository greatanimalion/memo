import React, { useState, useEffect } from "react";
import { getMemorysStarred, getRecentMemorys } from "@renderer/services/memeoy";
import { Memory } from "@type";
// import AIPart from "@renderer/components/AiPart";
import TimeDisplay from "./components/TimeDisplay";
import StarredFiles from "./components/StarredFiles";
import RecentFiles from "./components/RecentFiles";
import QuickNav from "./components/QuickNav";
import UsageStats from "./components/UsageStats";

const HomePage: React.FC = () => {
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [recentFiles, setRecentFiles] = useState<Memory[]>([]);
  const [starredFiles, setStarredFiles] = useState<Memory[]>([]);

  async function init() {
    try {
      const _recentFiles = await getRecentMemorys();
      setRecentFiles(_recentFiles);
      const starreds = await getMemorysStarred();
      setStarredFiles(starreds);
    } catch (error) {}
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    init();
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-4" style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
      <div className="max-w-7xl mx-auto space-y-6">
        <TimeDisplay currentTime={currentTime} />
        {/* <AIPart /> */}
        <QuickNav />
        <UsageStats />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <StarredFiles files={starredFiles} />
          <RecentFiles files={recentFiles} />
        </div>
      </div>
    </div>
  );
};

export default HomePage;