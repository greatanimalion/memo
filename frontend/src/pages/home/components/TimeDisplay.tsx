import React from "react";
import { formatTime, formatDate } from "@renderer/utils/dateUtils";
import RealTimeClock from "@renderer/pages/home/components/clock";

interface TimeDisplayProps {
  currentTime: Date;
}

const TimeDisplay: React.FC<TimeDisplayProps> = ({ currentTime }) => {
  return (
    <div className="bg-linear-to-r rounded-2xl p-8 shadow-lg">
      <div className="inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute w-75 h-75 rounded-full bg-sky-500 opacity-15 blur-[100px] top-[10%] right-[5%]" />
        <div className="absolute w-50 h-50 rounded-full bg-indigo-500 opacity-15 blur-[100px] bottom-[10%] right-[5%]" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
            <RealTimeClock />
          </div>
          <div>
            <h1 className="text-6xl font-bold mb-2">
              {formatTime(currentTime)}
            </h1>
            <p className="text-2xl opacity-90">{formatDate(currentTime)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg opacity-80 mb-1">欢迎回来</p>
          <p className="text-2xl font-semibold">用户</p>
        </div>
      </div>
    </div>
  );
};

export default TimeDisplay;