import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Handle, Position, useStore, type NodeProps } from "@xyflow/react";

import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/store/use-theme-store";
import type { FlowCanvasNodeData } from "./flow-adapter";

export type CanvasNodeRenderer = (node: CanvasNodeData, options: { scale: number; isSelected: boolean; isDragging: boolean }) => ReactNode;

export const CanvasNodeRendererContext = createContext<CanvasNodeRenderer | null>(null);

export function FlowCanvasNode({ data, selected, dragging, isConnectable }: NodeProps) {
    const renderNode = useContext(CanvasNodeRendererContext);
    const scale = useStore((state) => state.transform[2]);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const node = (data as FlowCanvasNodeData).node;
    const handleStyle: CSSProperties = { background: theme.node.panel, borderColor: theme.node.muted, opacity: selected ? 1 : undefined };

    return (
        <>
            {renderNode ? renderNode(node, { scale, isSelected: selected, isDragging: Boolean(dragging) }) : null}
            {node.type !== CanvasNodeType.Group ? <Handle type="target" position={Position.Left} id="target" className="canvas-flow-handle" isConnectable={isConnectable} style={handleStyle} /> : null}
            {node.type !== CanvasNodeType.Group && node.type !== CanvasNodeType.Config ? <Handle type="source" position={Position.Right} id="source" className="canvas-flow-handle" isConnectable={isConnectable} style={handleStyle} /> : null}
        </>
    );
}
