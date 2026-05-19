function setColor(bg: string, text: string) {
  document.documentElement.style.setProperty("--background", bg);
  document.documentElement.style.setProperty("--textColor", text);
}
export function setTheme(theme: number) {
  switch (theme) {
    case 0: // 1. 经典黑白 (极致对比)
      setColor("#000000", "#FFFFFF");
      return;
    case 1: // 2. 极简主义 (标准白底深灰字)
      setColor("#FFFFFF", "#333333");
      return;
    case 2: // 3. 现代暗黑 (柔和黑底，符合Material Design)
      setColor("#121212", "#E0E0E0");
      return;
    case 3: // 4. 护眼豆沙 (暖色护眼)
      setColor("#F5F5DC", "#555555");
      return;
    case 4: // 5. 深海蓝调 (商务科技风)
      setColor("#1A365D", "#F5F5F5");
      return;
    case 5: // 6. 复古羊皮纸 (文学怀旧风)
      setColor("#F4E4BC", "#4A3B2A");
      return;
    case 6: // 7. 高级灰 (现代冷淡风)
      setColor("#2C3E50", "#ECF0F1");
      return;
    case 7:
      setColor("#2b7fff", "#fff");
      return;
    default: 
      setColor("#2b7fff", "#fff");
      return;
  }
}
