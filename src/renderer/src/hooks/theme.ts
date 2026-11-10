// 主题值到class名的映射
export const themeClassMap: Record<number, string> = {
  0: "theme-classic-black",
  1: "theme-minimalism",
  2: "theme-modern-dark",
  3: "theme-eye-care",
  4: "theme-deep-blue",
  5: "theme-vintage-paper",
  6: "theme-premium-gray",
  7: "theme-blue",
};

// 获取所有主题class名（用于移除）
const allThemeClasses = Object.values(themeClassMap);

export function setTheme(theme: number) {
  // 移除所有主题class
  allThemeClasses.forEach((cls) => {
    document.body.classList.remove(cls);
  });

  // 添加新的主题class
  const newClass = themeClassMap[theme] || themeClassMap[7];
  document.body.classList.add(newClass);
}
