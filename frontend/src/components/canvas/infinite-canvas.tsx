import React, { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import {
    applyNodeChanges,
    Background,
    BackgroundVariant,
    ReactFlow,
    ReactFlowProvider,
    SelectionMode,
    ViewportPortal,
    type Connection,
    type Edge,
    type FinalConnectionState,
    type NodeChange,
    type OnConnectStartParams,
    type ReactFlowInstance,
    type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { canvasThemes, type CanvasBackgroundMode } from "@/lib/canvas-theme";
import { useThemeStore } from "@/store/use-theme-store";
import type { CanvasConnection, CanvasNodeData, Position, ViewportTransform } from "@/types/canvas";
import { fromFlowNodes, toFlowEdges, toFlowNodes, type FlowCanvasEdge, type FlowCanvasNode } from "./flow/flow-adapter";
import { CanvasNodeRendererContext, FlowCanvasNode as FlowCanvasNodeComponent, type CanvasNodeRenderer } from "./flow/flow-node";
import { FlowCanvasEdge as FlowCanvasEdgeComponent } from "./flow/flow-edge";

const nodeTypes = { canvas: FlowCanvasNodeComponent, group: FlowCanvasNodeComponent };
const edgeTypes = { canvas: FlowCanvasEdgeComponent };

type ConnectHandleType = "source" | "target";

type InfiniteCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    tool: "select" | "pan";
    backgroundMode?: CanvasBackgroundMode;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    highlightedConnectionIds?: Set<string>;
    interactive?: boolean;
    renderNode: CanvasNodeRenderer;
    instanceRef?: MutableRefObject<CanvasFlowInstance | null>;
    overlay?: ReactNode;
    onViewportChange: (viewport: ViewportTransform) => void;
    onCanvasNodesChange: (nodes: CanvasNodeData[], selectedNodeIds: Set<string>) => void;
    onCanvasSelectionChange: (nodeIds: Set<string>) => void;
    onNodesDelete: (nodeIds: string[]) => void;
    onConnectionSelect: (connectionId: string | null) => void;
    onConnectionDelete: (connectionId: string) => void;
    onNodeContextMenu: (event: React.MouseEvent, nodeId: string) => void;
    onConnectionContextMenu: (event: React.MouseEvent, connectionId: string) => void;
    validateConnection: (fromNodeId: string, toNodeId: string, handleType: ConnectHandleType) => boolean;
    onCanvasConnect: (fromNodeId: string, toNodeId: string) => void;
    onConnectEnd: (info: { fromNodeId: string; handleType: ConnectHandleType; position: Position }) => void;
    onNodeDragStart: () => void;
    onNodeDragStop: (nodeIds: string[], nodes: CanvasNodeData[]) => void;
    onPaneClick?: () => void;
    onPaneDoubleClick: (position: Position) => void;
    onPaneContextMenu?: (event: React.MouseEvent) => void;
    onDrop?: (event: React.DragEvent<HTMLDivElement>) => void;
};

export type CanvasFlowInstance = Pick<ReactFlowInstance<FlowCanvasNode, FlowCanvasEdge>, "setViewport" | "zoomTo" | "getViewport" | "screenToFlowPosition">;

const selectionOf = (flowNodes: FlowCanvasNode[]) => {
    const ids = new Set<string>();
    flowNodes.forEach((flowNode) => {
        if (flowNode.selected) ids.add(flowNode.id);
    });
    return ids;
};

const toFlowViewport = (viewport: ViewportTransform): Viewport => ({ x: viewport.x, y: viewport.y, zoom: viewport.k });
const fromFlowViewport = (viewport: Viewport): ViewportTransform => ({ x: viewport.x, y: viewport.y, k: viewport.zoom });

export function InfiniteCanvas({ containerRef, viewport, tool, backgroundMode = "lines", nodes, connections, selectedNodeIds, selectedConnectionId, highlightedConnectionIds, interactive = true, renderNode, instanceRef, overlay, onViewportChange, onCanvasNodesChange, onCanvasSelectionChange, onNodesDelete, onConnectionSelect, onConnectionDelete, onNodeContextMenu, onConnectionContextMenu, validateConnection, onCanvasConnect, onConnectEnd, onNodeDragStart, onNodeDragStop, onPaneClick, onPaneDoubleClick, onPaneContextMenu, onDrop }: InfiniteCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const localInstanceRef = useRef<CanvasFlowInstance | null>(null);
    const flowNodesRef = useRef<FlowCanvasNode[]>([]);
    const emittedNodesRef = useRef<CanvasNodeData[] | null>(null);
    const connectStartRef = useRef<{ nodeId: string; handleType: ConnectHandleType } | null>(null);
    const [flowNodes, setFlowNodes] = useState<FlowCanvasNode[]>(() => toFlowNodes(nodes, selectedNodeIds));
    const draggingRef = useRef(false);
    const lastSelectionKeyRef = useRef("");
    const [toolInverted, setToolInverted] = useState(false);

    flowNodesRef.current = flowNodes;
    const flowEdges = useMemo(() => toFlowEdges(connections, selectedConnectionId, highlightedConnectionIds), [connections, highlightedConnectionIds, selectedConnectionId]);

    // Controlled viewport: React Flow owns the transform, the page keeps a copy for overlays and persistence.
    useEffect(() => {
        const instance = localInstanceRef.current;
        if (!instance) return;
        const current = instance.getViewport();
        if (Math.abs(current.x - viewport.x) < 0.5 && Math.abs(current.y - viewport.y) < 0.5 && Math.abs(current.zoom - viewport.k) < 0.001) return;
        void instance.setViewport(toFlowViewport(viewport));
    }, [viewport]);

    // Re-derive React Flow nodes whenever the page mutates or replaces the canvas data, skipping our own emissions.
    useEffect(() => {
        if (nodes === emittedNodesRef.current) return;
        const next = toFlowNodes(nodes, selectedNodeIds);
        flowNodesRef.current = next;
        setFlowNodes(next);
    }, [nodes, selectedNodeIds]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Control") setToolInverted(true);
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key === "Control") setToolInverted(false);
        };
        const handleBlur = () => setToolInverted(false);
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, []);

    const emitSelection = useCallback(
        (ids: Set<string>) => {
            const key = Array.from(ids).sort().join("|");
            if (key === lastSelectionKeyRef.current) return;
            lastSelectionKeyRef.current = key;
            onCanvasSelectionChange(ids);
        },
        [onCanvasSelectionChange],
    );

    const handleNodesChange = useCallback(
        (changes: NodeChange<FlowCanvasNode>[]) => {
            const next = applyNodeChanges(changes, flowNodesRef.current);
            flowNodesRef.current = next;
            setFlowNodes(next);

            const removed = changes.filter((change) => change.type === "remove").map((change) => change.id);
            if (removed.length) {
                onNodesDelete(removed);
                return;
            }

            const hasSelection = changes.some((change) => change.type === "select");
            const hasGeometry = changes.some((change) => change.type === "position" || change.type === "dimensions" || change.type === "add" || change.type === "replace");
            // Dragging stays inside React Flow and is committed once on drag stop, so the page does not rerender per pointermove.
            if (draggingRef.current) {
                if (hasSelection) emitSelection(selectionOf(next));
                return;
            }
            if (!hasGeometry) {
                if (hasSelection) emitSelection(selectionOf(next));
                return;
            }

            const converted = fromFlowNodes(next);
            emittedNodesRef.current = converted.nodes;
            lastSelectionKeyRef.current = Array.from(converted.selectedNodeIds).sort().join("|");
            onCanvasNodesChange(converted.nodes, converted.selectedNodeIds);
        },
        [emitSelection, onCanvasNodesChange, onNodesDelete],
    );

    const handleEdgesChange = useCallback(
        (changes: { type: string; id?: string; selected?: boolean }[]) => {
            const removed = changes.filter((change) => change.type === "remove" && change.id).map((change) => change.id as string);
            removed.forEach((id) => onConnectionDelete(id));
            const selection = changes.find((change) => change.type === "select");
            if (selection && selection.id) onConnectionSelect(selection.selected ? selection.id : null);
        },
        [onConnectionDelete, onConnectionSelect],
    );

    const handleConnectStart = useCallback((_event: unknown, params: OnConnectStartParams) => {
        if (!params.nodeId || (params.handleType !== "source" && params.handleType !== "target")) {
            connectStartRef.current = null;
            return;
        }
        connectStartRef.current = { nodeId: params.nodeId, handleType: params.handleType };
    }, []);

    const handleConnect = useCallback(
        (connection: Connection) => {
            const start = connectStartRef.current;
            if (!start) return;
            const otherNodeId = connection.source === start.nodeId ? connection.target : connection.source;
            if (!otherNodeId || otherNodeId === start.nodeId) return;
            // The handle sides decide the direction, so a drag from a left handle lands on the other node's right side.
            const otherHandleId = connection.source === start.nodeId ? connection.targetHandle : connection.sourceHandle;
            const startIsSource = start.handleType === "source";
            if (startIsSource === (otherHandleId === "source")) return;
            onCanvasConnect(startIsSource ? start.nodeId : otherNodeId, startIsSource ? otherNodeId : start.nodeId);
        },
        [onCanvasConnect],
    );

    const handleConnectEnd = useCallback(
        (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
            const start = connectStartRef.current;
            connectStartRef.current = null;
            if (!start || state.toNode) return;
            const instance = localInstanceRef.current;
            if (!instance) return;
            const point = "clientX" in event ? { x: event.clientX, y: event.clientY } : { x: event.changedTouches?.[0]?.clientX ?? 0, y: event.changedTouches?.[0]?.clientY ?? 0 };
            onConnectEnd({ fromNodeId: start.nodeId, handleType: start.handleType, position: instance.screenToFlowPosition(point) });
        },
        [onConnectEnd],
    );

    const handleIsValidConnection = useCallback(
        (connection: Connection | Edge) => {
            const start = connectStartRef.current;
            if (!start) return false;
            if (connection.sourceHandle && connection.targetHandle && connection.sourceHandle === connection.targetHandle) return false;
            const targetNodeId = connection.source === start.nodeId ? connection.target : connection.source;
            if (!targetNodeId) return false;
            return validateConnection(start.nodeId, targetNodeId, start.handleType);
        },
        [validateConnection],
    );

    const handleNodeDragStart = useCallback(() => {
        draggingRef.current = true;
        onNodeDragStart();
    }, [onNodeDragStart]);

    const handleNodeDragStop = useCallback(
        (_event: MouseEvent | TouchEvent, node: FlowCanvasNode, draggedNodes: FlowCanvasNode[]) => {
            draggingRef.current = false;
            const converted = fromFlowNodes(flowNodesRef.current);
            emittedNodesRef.current = converted.nodes;
            lastSelectionKeyRef.current = Array.from(converted.selectedNodeIds).sort().join("|");
            onCanvasNodesChange(converted.nodes, converted.selectedNodeIds);
            onNodeDragStop(
                draggedNodes.length ? draggedNodes.map((item) => item.id) : [node.id],
                converted.nodes,
            );
        },
        [onCanvasNodesChange, onNodeDragStop],
    );

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        // Capture phase: React Flow's own double-click handler may stop propagation on the pane.
        const handleDoubleClick = (event: MouseEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target?.closest(".react-flow__pane")) return;
            const instance = localInstanceRef.current;
            if (!instance) return;
            onPaneDoubleClick(instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        };
        container.addEventListener("dblclick", handleDoubleClick, true);
        return () => container.removeEventListener("dblclick", handleDoubleClick, true);
    }, [containerRef, onPaneDoubleClick]);

    const handleInit = useCallback(
        (instance: CanvasFlowInstance) => {
            localInstanceRef.current = instance;
            if (instanceRef) instanceRef.current = instance;
            void instance.setViewport(toFlowViewport(viewport));
        },
        [],
    );

    const effectiveTool = toolInverted ? (tool === "select" ? "pan" : "select") : tool;
    const panOnDrag = effectiveTool === "pan" ? [0, 1] : [1];
    const selectionOnDrag = effectiveTool === "select";
    const renderNodeCallback = renderNode;

    return (
        <div ref={containerRef} className="relative h-full w-full select-none overflow-hidden" style={{ background: theme.canvas.background }} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <CanvasNodeRendererContext.Provider value={renderNodeCallback}>
                <ReactFlowProvider>
                    <ReactFlow<FlowCanvasNode, FlowCanvasEdge>
                        nodes={flowNodes}
                        edges={flowEdges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        defaultViewport={toFlowViewport(viewport)}
                        onViewportChange={(next) => onViewportChange(fromFlowViewport(next))}
                        onNodesChange={handleNodesChange}
                        onEdgesChange={handleEdgesChange}
                        onNodeDragStart={handleNodeDragStart}
                        onNodeDragStop={handleNodeDragStop}
                        onConnectStart={handleConnectStart}
                        onConnect={handleConnect}
                        onConnectEnd={handleConnectEnd}
                        isValidConnection={handleIsValidConnection}
                        onInit={handleInit}
                        onPaneClick={() => onPaneClick?.()}
                        onPaneContextMenu={(event) => onPaneContextMenu?.(event as React.MouseEvent)}
                        onNodeContextMenu={(event, node) => onNodeContextMenu(event, node.id)}
                        onEdgeContextMenu={(event, edge) => onConnectionContextMenu(event, edge.id)}
                        minZoom={0.05}
                        maxZoom={5}
                        connectionRadius={40}
                        panOnDrag={panOnDrag}
                        selectionOnDrag={selectionOnDrag}
                        panActivationKeyCode="Space"
                        selectionMode={SelectionMode.Partial}
                        zoomOnScroll
                        zoomOnDoubleClick={false}
                        preventScrolling
                        noDragClassName="nodrag"
                        deleteKeyCode={null}
                        nodesDraggable={interactive}
                        nodesConnectable={interactive}
                        elementsSelectable={interactive}
                        elevateNodesOnSelect={false}
                        onlyRenderVisibleElements
                        proOptions={{ hideAttribution: true }} // 隐藏右下角水印
                        connectionLineStyle={{ stroke: theme.node.activeStroke, strokeWidth: 2, strokeDasharray: "5,5" }}
                    >
                        {backgroundMode !== "blank" ? (
                            <Background variant={backgroundMode === "dots" ? BackgroundVariant.Dots : BackgroundVariant.Lines} gap={48} size={1} color={backgroundMode === "dots" ? theme.canvas.dot : theme.canvas.line} />
                        ) : null}
                        <ViewportPortal>{overlay}</ViewportPortal>
                    </ReactFlow>
                </ReactFlowProvider>
            </CanvasNodeRendererContext.Provider>
        </div>
    );
}
