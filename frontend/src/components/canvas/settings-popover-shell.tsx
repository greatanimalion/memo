// 画布设置弹层的统一骨架。
// 原先 Image / Video / Audio / Text 四个弹层各自复制了：
//   按钮锚点 ref、open/rect 状态、resize/scroll/pointerdown 监听、portal 定位算法、
//   以及三个事件穿透拦截 —— 只是「摘要文案」和「面板内容」不同。
// 这里把骨架收敛为 useAnchoredPopover + AnchoredPopover + createSettingsPopover，
// 四类弹层只声明自身差异部分。

import { useEffect, useRef, useState, type ReactNode, type RefObject, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button } from "antd";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/store/use-theme-store";
import type { AiConfig } from "@/store/use-config-store";

export type PopoverPlacement = "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";

/** 四类配置弹层共享的 props。 */
export type SettingsPopoverBaseProps = {
    config: AiConfig;
    // 各面板的 key/value 类型不同，统一在工厂内部按 any 透传，由具体面板自行约束
    onConfigChange: (key: any, value: any) => void;
    buttonClassName?: string;
    placement?: PopoverPlacement;
    onOpenChange?: (open: boolean) => void;
};

const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();

/** 锚定弹层：负责 portal 定位与事件穿透拦截，替代四份重复的定位代码。 */
export function AnchoredPopover({
    rect,
    placement,
    theme,
    panelRef,
    className,
    children,
}: {
    rect: DOMRect;
    placement?: PopoverPlacement;
    theme: CanvasTheme;
    panelRef: RefObject<HTMLDivElement | null>;
    className?: string;
    children: ReactNode;
}) {
    const width = 356;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? rect.left + rect.width / 2 - width / 2 : alignRight ? rect.right - width : rect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement
            ? { bottom: window.innerHeight - rect.top + gap, maxHeight: Math.max(260, rect.top - margin * 2) }
            : { top: rect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - rect.bottom - margin * 2) }),
        background: theme.toolbar.panel,
        borderRadius: 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 18,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div ref={panelRef} className={className} style={style} onPointerDown={stopPropagation} onMouseDown={stopPropagation} onClick={stopPropagation}>
            {children}
        </div>,
        document.body,
    );
}

/** 锚定弹层的状态与副作用：开关、按钮位置同步、外部点击关闭。 */
function useAnchoredPopover(onOpenChange?: (open: boolean) => void) {
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
            onOpenChange?.(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [onOpenChange, open]);

    const toggle = () => {
        const next = !open;
        setOpen(next);
        onOpenChange?.(next);
    };

    return { buttonRef, panelRef, open, buttonRect, toggle };
}

/**
 * 弹层工厂：注入「摘要文案 + 面板内容」即可得到完整弹层组件。
 * 保持与原四个组件一致的按钮结构、默认样式与 portal 容器。
 */
export function createSettingsPopover<P extends SettingsPopoverBaseProps>(options: {
    /** 默认按钮样式，调用方传 buttonClassName 时覆盖 */
    defaultClassName: string;
    /** 按钮上的摘要文案 */
    summary: (props: P, t: TFunction) => ReactNode;
    /** 展开后的面板内容 */
    panel: (props: P, theme: CanvasTheme, t: TFunction) => ReactNode;
    /** portal 容器 class，沿用原实现的命名 */
    panelClassName?: string;
}) {
    return function SettingsPopover(props: P) {
        const { t } = useTranslation();
        const theme = canvasThemes[useThemeStore((state) => state.theme)];
        const { buttonRef, panelRef, open, buttonRect, toggle } = useAnchoredPopover(props.onOpenChange);

        return (
            <>
                <span ref={buttonRef} className="inline-flex min-w-0">
                    <Button
                        size="small"
                        type="text"
                        className={props.buttonClassName || options.defaultClassName}
                        style={{ background: theme.node.fill, color: theme.node.text }}
                        icon={<Settings2 className="size-3.5" />}
                        onClick={toggle}
                    >
                        <span className="truncate">{options.summary(props, t)}</span>
                    </Button>
                </span>
                {open && buttonRect ? (
                    <AnchoredPopover rect={buttonRect} placement={props.placement} theme={theme} panelRef={panelRef} className={options.panelClassName}>
                        {options.panel(props, theme, t)}
                    </AnchoredPopover>
                ) : null}
            </>
        );
    };
}
