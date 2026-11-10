import React from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import useFileStore from "@renderer/store/useFileStore";
interface PathNavigationProps {
  onBackClick: () => void;
  onPathClick?: (index: number) => void;
}
const PathNavigation: React.FC<PathNavigationProps> = ({
  onBackClick,
  onPathClick,
}) => {
  const path = useFileStore((state) => state.currentPathArr);
  return (
    <div className="flex items-center gap-3">
      {path.length > 1 && (
        <button
          onClick={onBackClick}
          className="p-2 rounded-lg transition-colors text-gray-600 hover:text-blue-600 cursor-pointer"
        >
          <ArrowLeftOutlined className="text-base" />
        </button>
      )}
      <div className="flex items-center gap-2">
        {path.map((p, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="text-gray-400">/</span>}
            <span
              className="text-sm text-blue-600 font-medium cursor-pointer hover:underline"
              onClick={() => onPathClick?.(index)}
            >
              {p}
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default PathNavigation;
