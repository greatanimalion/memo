import type { ThemeConfig } from "antd";

function getCSSVariable(name: string): string {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

export function getAntdThemeFromCSS(): ThemeConfig {
  const bgColor = getCSSVariable("--bg-primary") || "#ffffff";
  const textColor = getCSSVariable("--text-primary") || "#333333";
  const primaryColor = getCSSVariable("--accent-color") || "#6366f1";
  const borderColor = getCSSVariable("--border-color") || "#E0E0E0";
  const successColor = getCSSVariable("--success-color") || "#10B981";
  const warningColor = getCSSVariable("--warning-color") || "#F59E0B";
  const errorColor = getCSSVariable("--error-color") || "#EF4444";
  const infoColor = getCSSVariable("--info-color") || "#3B82F6";

  return {
    token: {
      colorPrimary: primaryColor,
      colorBgContainer: bgColor,
      colorBgElevated: getCSSVariable("--bg-secondary") || bgColor,
      colorBgLayout: getCSSVariable("--bg-secondary") || bgColor,
      colorText: textColor,
      colorTextSecondary: getCSSVariable("--text-secondary") || textColor,
      colorTextTertiary: getCSSVariable("--text-tertiary") || textColor,
      colorTextQuaternary: getCSSVariable("--text-muted") || textColor,
      colorBorder: borderColor,
      colorBorderSecondary: getCSSVariable("--border-light") || borderColor,
      colorSuccess: successColor,
      colorWarning: warningColor,
      colorError: errorColor,
      colorInfo: infoColor,
      borderRadius: 8,
      colorLink: primaryColor,
      colorLinkHover: primaryColor,
      colorLinkActive: primaryColor,
      controlHeight: 36,
      fontSize: 14,
      colorBgTextHover: getCSSVariable("--bg-hover") || bgColor,
      colorBgTextActive: getCSSVariable("--bg-active") || bgColor,
      boxShadow: getCSSVariable("--shadow-md") || "none",
      boxShadowSecondary: getCSSVariable("--shadow-lg") || "none",
    },
    components: {
      Button: {
        primaryShadow: "none",
        defaultShadow: "none",
        colorBgContainer: bgColor,
        colorBorder: borderColor,
      },
      Input: {
        colorBgContainer: bgColor,
        activeBorderColor: primaryColor,
        hoverBorderColor: primaryColor,
      },
      Select: {
        colorBgContainer: bgColor,
        optionSelectedBg: getCSSVariable("--bg-tertiary") || bgColor,
        optionActiveBg: getCSSVariable("--bg-hover") || bgColor,
      },
      Modal: {
        contentBg: bgColor,
        headerBg: bgColor,
        titleColor: textColor,
      },
      Card: {
        colorBgContainer: bgColor,
      },
      Table: {
        colorBgContainer: bgColor,
        headerBg: getCSSVariable("--bg-secondary") || bgColor,
        rowHoverBg: getCSSVariable("--bg-hover") || bgColor,
      },
      Menu: {
        colorBgContainer: bgColor,
        itemColor: textColor,
        itemHoverColor: primaryColor,
        itemSelectedColor: primaryColor,
        itemSelectedBg: getCSSVariable("--bg-tertiary") || bgColor,
      },
      Dropdown: {
        colorBgElevated: bgColor,
        controlItemBgHover: getCSSVariable("--bg-hover") || bgColor,
        controlItemBgActive: getCSSVariable("--bg-tertiary") || bgColor,
      },
      Calendar: {
        colorBgContainer: bgColor,
      },
      Badge: {
        colorError: errorColor,
      },
      Form: {
        labelColor: textColor,
      },
      Typography: {
        colorText: textColor,
        colorTextSecondary: getCSSVariable("--text-secondary") || textColor,
      },
      Message: {
        contentBg: bgColor,
      },
      Notification: {
        colorBgElevated: bgColor,
      },
    },
  };
}

export function getThemeCSSClass(themeValue: number): string {
  const themeClassMap: Record<number, string> = {
    0: "theme-classic-black",
    1: "theme-minimalism",
    2: "theme-modern-dark",
    3: "theme-eye-care",
    4: "theme-deep-blue",
    5: "theme-vintage-paper",
    6: "theme-premium-gray",
    7: "theme-blue",
  };
  return themeClassMap[themeValue] || themeClassMap[7];
}