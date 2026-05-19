import { useState, useEffect, useMemo } from 'react';

const RealTimeClock = () => {
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => {
      setDate(new Date());
    }, 1000);
    return () => clearInterval(timerId);
  }, []);

  const seconds = date.getSeconds();
  const minutes = date.getMinutes();
  const hours = date.getHours();

  const secondDeg = seconds * 6;
  const minuteDeg = minutes * 6 + seconds * 0.1;
  const hourDeg = (hours % 12) * 30 + minutes * 0.5;

  // --- 使用 useMemo 精确计算所有刻度的位置 ---
  const ticks :any= useMemo(() => {
    const newTicks = [];
    const radius = 40; // 刻度距离中心的半径百分比
    for (let i = 0; i < 12; i++) {
      // 从12点钟方向(-90度)开始，顺时针计算每个刻度的角度
      const angleDeg = i * 30 - 90;
      const angleRad = (angleDeg * Math.PI) / 180;
      
      // 计算相对于中心的 x, y 偏移百分比
      const x = Math.cos(angleRad) * radius;
      const y = Math.sin(angleRad) * radius;
      //@ts-ignore
      newTicks.push({
        isMajor: i % 3 === 0, // 0, 3, 6, 9 点位置是主刻度
        style: {
          top: `${50 + y}%`,
          left: `${50 + x}%`,
        }
      });
    }
    return newTicks;
  }, []);

  const styles = {
    analogClock: {
      width: '100px',
      height: '100px',
      border: '4px solid #333',
      borderRadius: '50%',
      position: 'relative',
      background: '#fff',
      boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
      boxSizing: 'border-box',
    },
    // 主刻度 (12, 3, 6, 9)
    majorTick: {
      position: 'absolute',
      width: '6px',
      height: '6px',
      backgroundColor: '#333',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)',
    },
    // 次刻度 (其余点位)
    minorTick: {
      position: 'absolute',
      width: '3px',
      height: '3px',
      backgroundColor: '#333',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)',
    },
    hand: {
      position: 'absolute',
      bottom: '50%',
      left: '50%',
      transformOrigin: 'bottom center',
      borderRadius: '4px',
      zIndex: 10,
    },
    hourHand: { height: '30px', width: '4px', backgroundColor: '#333', marginLeft: '-2px' },
    minuteHand: { height: '40px', width: '3px', backgroundColor: '#666', marginLeft: '-1.5px' },
    secondHand: { height: '38px', width: '2px', backgroundColor: '#e74c3c', marginLeft: '-1px' },
    centerDot: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      width: '8px',
      height: '8px',
      backgroundColor: '#333',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 12,
    }
  }  as const;

  return (
    <div  >
      <div style={styles.analogClock}> 
        {/* 动态渲染所有刻度 */}
        {ticks.map((tick, index) => (
          <div
            key={index}
            style={tick.isMajor ? { ...styles.majorTick, ...tick.style } : { ...styles.minorTick, ...tick.style }}
          />
        ))}

        {/* 指针 */}
        <div style={{ ...styles.hand, ...styles.hourHand, transform: `rotate(${hourDeg}deg)` }} />
        <div style={{ ...styles.hand, ...styles.minuteHand, transform: `rotate(${minuteDeg}deg)` }} />
        <div style={{ ...styles.hand, ...styles.secondHand, transform: `rotate(${secondDeg}deg)` }} />
        
        {/* 中心点 */}
        <div style={styles.centerDot} />
      </div>
    </div>
  );
};

export default RealTimeClock;