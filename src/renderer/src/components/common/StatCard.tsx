import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
}

const colorMap: Record<string, string> = {
  blue: "text-blue-600",
  purple: "text-purple-600",
  green: "text-green-600",
  orange: "text-orange-600",
  red: "text-red-600",
};

const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  color = "blue",
}) => {
  return (
    <div className="bg-white rounded-xl p-5 shadow-lg">
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorMap[color] || colorMap.blue}`}>
        {value}
      </div>
    </div>
  );
};

export default StatCard;
