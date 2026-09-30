import { useMemo } from "react";

// 功能浮动标签配置 - 分散在AI大脑外围
const featureTags = [
  {
    text: "AI 规划",
    subtext: "智能规划未来计划",
    className: "top-1/2 right-0 translate-y-[-50%] translate-x-full",
    delay: "0.3s",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="w-4 h-4"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
        <path d="M11 8v6" />
        <path d="M8 11h6" />
      </svg>
    ),
  },
  {
    text: "内容生成",
    subtext: "AI 辅助编写文档",
    className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-full",
    delay: "0.6s",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="w-4 h-4"
      >
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    text: "智能对话",
    subtext: "AI 助力智能对话",
    className: "top-1/2 left-0 -translate-y-1/2 -translate-x-full",
    delay: "0.9s",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="w-4 h-4"
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v4" />
        <path d="M12 18v4" />
        <path d="M4.93 4.93l2.83 2.83" />
        <path d="M16.24 16.24l2.83 2.83" />
        <path d="M2 12h4" />
        <path d="M18 12h4" />
      </svg>
    ),
  },
];

function App() {
  // 生成粒子
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${Math.random() * 10}s`,
      duration: `${15 + Math.random() * 10}s`,
    }));
  }, []);

  return (
    <div className="h-100 overflow-hidden relative rounded-2xl w-full  bg-black text-slate-50 font-sans">
      {/* 背景粒子 */}
      <div className="absoute inset-0 pointer-events-none overflow-hidden z-0">
        {particles.map((p, i) => (
          <div
            key={i}
            className="particle absolute w-1 h-1 rounded-full"
            style={{
              left: p.left,
              top: p.top,
              background:
                "radial-gradient(circle, #22d3ee 0%, transparent 70%)",
              opacity: 0.5,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}
        {/* 渐变光斑 */}
        <div className="absolute w-75 h-75 rounded-full bg-sky-500 opacity-10 blur-[150px] top-[10%] left-[10%]" />
        <div className="absolute w-62.5 h-125 rounded-full bg-indigo-500 opacity-10 blur-[150px] bottom-[10%] right-[10%]" />
      </div>
      {/* 主内容区域 */}
      <div className="h-full flex flex-col items-center justify-center px-16 ">
        {/* AI 大脑区域 */}
        <div className="relative w-64 h-64   flex items-center justify-center mb-16">
          {/* 旋转光环 - 使用伪元素避免定位问题 */}
          <div className="absolute inset-0 flex items-center justify-center">
            {/* 外环 */}
            <div
              className="absolute w-56 h-56  rounded-full"
              style={{
                border: "2px solid transparent",
                borderTopColor: "#22d3ee",
                borderRightColor: "#6366f1",
                animation: "spin 10s linear infinite",
              }}
            />
            {/* 中环 */}
            <div
              className="absolute w-40 h-40  rounded-full"
              style={{
                border: "2px solid transparent",
                borderBottomColor: "#0ea5e9",
                borderLeftColor: "#22d3ee",
                animation: "spin-reverse 7s linear infinite",
              }}
            />
            {/* 内环 */}
            <div
              className="absolute w-28 h-28  rounded-full"
              style={{
                border: "2px solid transparent",
                borderTopColor: "#6366f1",
                borderRightColor: "#0ea5e9",
                animation: "spin 5s linear infinite",
              }}
            />
          </div>

          {/* AI 大脑核心 */}
          <div className="relative z-10 w-16 h-16 bg-linear-to-br from-sky-400 to-cyan-300 rounded-full shadow-[0_0_60px_#0ea5e9,0_0_100px_rgba(14,165,233,0.5)] animate-pulse" />
          {/* 四周功能浮动标签 - 绝对定位在容器外围 */}
          {featureTags.map((tag, i) => (
            <div
              key={i}
              className={`absolute flex items-center gap-2 px-3 py-2 bg-slate-800/90 backdrop-blur-md border border-sky-500/40 rounded-xl shadow-[0_0_20px_rgba(14,165,233,0.15)] animate-pulse ${tag.className}`}
              style={{ animationDelay: tag.delay }}
            >
              <div className="w-8 h-8 bg-linear-to-br from-sky-500 to-indigo-500 rounded-lg flex items-center justify-center text-white shrink-0">
                {tag.icon}
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-200 whitespace-nowrap">
                  {tag.text}
                </span>
                <span className="block text-[10px] text-slate-400 whitespace-nowrap">
                  {tag.subtext}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* 文字内容区域 */}
        <div className="text-center max-w-2xl px-4">
          <p className="text-slate-400 text-base lg:text-lg leading-relaxed mb-8">
            融合先进人工智能技术，让规划变得得心应手，
            让信息搜索瞬息可得，让内容创作如有神助。
          </p>
        </div>
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes float-particle {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.5; }
          50% { transform: translateY(-30px) translateX(10px); opacity: 0.7; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        .particle { animation: float-particle 18s infinite ease-in-out; }
      `}</style>
    </div>
  );
}

export default App;
