"use client";

import { cn } from "@/lib/utils";
import { useGlobalStore } from "@/store/global";
import { useRoomStore } from "@/store/room";
import { ClientDTOType, GRID, PositionType } from "@chorus/shared";
import { Crown, HeadphonesIcon } from "lucide-react";
import { motion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// Per-device avatar hues, matching the redesign's palette (design lines 708).
// Exported so RoomHeader's stacked avatars use the same color per client.
export const DEVICE_COLORS = [
  "oklch(64% 0.14 265)",
  "oklch(64% 0.13 150)",
  "oklch(66% 0.15 300)",
  "oklch(68% 0.15 60)",
];

// What's currently being dragged on the grid, if anything.
type DragTarget = { kind: "source" } | { kind: "device"; clientId: string } | null;

interface DeviceDotProps {
  client: ClientDTOType;
  isCurrentUser: boolean;
  color: string;
  position: PositionType;
  isDragging: boolean;
  onDragStart: (e: React.MouseEvent | React.TouchEvent) => void;
  onDragEnd: () => void;
}

const DeviceDot = memo<DeviceDotProps>(
  ({ client, isCurrentUser, color, position, isDragging, onDragStart, onDragEnd }) => {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            className={cn(
              "absolute z-10 -translate-x-1/2 -translate-y-1/2",
              isCurrentUser && "cursor-move"
            )}
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            {...(!isDragging && {
              animate: { opacity: 1, left: `${position.x}%`, top: `${position.y}%` },
              transition: { duration: 0.15, ease: "easeInOut" },
            })}
            onMouseDown={isCurrentUser ? onDragStart : undefined}
            onTouchStart={isCurrentUser ? onDragStart : undefined}
            onMouseUp={isCurrentUser ? onDragEnd : undefined}
            onTouchEnd={isCurrentUser ? onDragEnd : undefined}
          >
            <div className="relative">
              <div
                className="flex size-7 items-center justify-center rounded-full border-2 border-background text-[10px] font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {client.username.slice(0, 2).toUpperCase()}
              </div>
              {client.isAdmin && (
                <div className="absolute -right-0.5 -top-0.5 rounded-full bg-warn p-0.5">
                  <Crown className="size-2.5 text-warn-bg" fill="currentColor" />
                </div>
              )}
              {isCurrentUser && (
                <div className="absolute -bottom-1 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </div>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="text-xs font-medium">{client.username}</div>
          <div className="text-xs text-muted-foreground">
            {isCurrentUser ? "You — drag to reposition" : "Connected"}
            {client.isAdmin && " • Admin"}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }
);
DeviceDot.displayName = "DeviceDot";

/**
 * Room map: drag the listening source to re-pan gain, or drag your own
 * device to tell the room where you're actually standing.
 *
 * Ported from the old UserGrid.tsx verbatim on the interaction side — grid
 * units ARE CSS percentages (GRID.SIZE === 100), the socket send is
 * throttled to 100ms while the local position updates every frame, touch
 * drag needs a hand-registered non-passive `touchmove` listener, and
 * `isDraggingListeningSource` guards against the server echo fighting the
 * user's finger mid-drag (see store/global.tsx processSpatialConfig).
 * Device dragging (self only — the server enforces this) mirrors the same
 * mechanics but keeps its optimistic position local to this component
 * rather than in global state, since nothing else needs to read it.
 */
export const SpatialMap = () => {
  const userId = useRoomStore((state) => state.userId);
  const listeningSource = useGlobalStore((state) => state.listeningSourcePosition);
  const setListeningSourcePosition = useGlobalStore((state) => state.setListeningSourcePosition);
  const gridRef = useRef<HTMLDivElement>(null);
  const updateListeningSourceSocket = useGlobalStore((state) => state.updateListeningSource);
  const moveClientSocket = useGlobalStore((state) => state.moveClient);
  const isSpatialAudioEnabled = useGlobalStore((state) => state.isSpatialAudioEnabled);
  const clients = useGlobalStore((state) => state.connectedClients);
  const isDraggingListeningSource = useGlobalStore((state) => state.isDraggingListeningSource);
  const setIsDraggingListeningSource = useGlobalStore((state) => state.setIsDraggingListeningSource);

  const [animationSyncKey, setAnimationSyncKey] = useState(Date.now());
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [devicePosition, setDevicePosition] = useState<PositionType | null>(null);
  const lastSourceSendRef = useRef(0);
  const lastDeviceSendRef = useRef(0);
  const animationFrameRef = useRef(0);

  const throttleUpdateSourcePosition = useCallback(
    (x: number, y: number) => {
      const now = Date.now();
      if (now - lastSourceSendRef.current >= 100) {
        updateListeningSourceSocket({ x, y });
        lastSourceSendRef.current = now;
      }
    },
    [updateListeningSourceSocket]
  );

  const throttleMoveClient = useCallback(
    (clientId: string, x: number, y: number) => {
      const now = Date.now();
      if (now - lastDeviceSendRef.current >= 100) {
        moveClientSocket(clientId, { x, y });
        lastDeviceSendRef.current = now;
      }
    },
    [moveClientSocket]
  );

  useEffect(() => {
    setAnimationSyncKey(Date.now());
  }, [clients]);

  const onGridPointerMove = useCallback(
    (x: number, y: number) => {
      if (!dragTarget) return;
      const boundedX = Math.max(0, Math.min(GRID.SIZE, x));
      const boundedY = Math.max(0, Math.min(GRID.SIZE, y));

      if (dragTarget.kind === "source") {
        setListeningSourcePosition({ x: boundedX, y: boundedY });
        throttleUpdateSourcePosition(boundedX, boundedY);
      } else {
        setDevicePosition({ x: boundedX, y: boundedY });
        throttleMoveClient(dragTarget.clientId, boundedX, boundedY);
      }
    },
    [dragTarget, setListeningSourcePosition, throttleUpdateSourcePosition, throttleMoveClient]
  );

  const handleSourceMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDragTarget({ kind: "source" });
      setIsDraggingListeningSource(true);
    },
    [setIsDraggingListeningSource]
  );

  const handleSourceTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      setDragTarget({ kind: "source" });
      setIsDraggingListeningSource(true);
    },
    [setIsDraggingListeningSource]
  );

  const handleDeviceDragStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      const current = clients.find((c) => c.clientId === userId);
      if (!current) return;
      setDevicePosition(current.position);
      setDragTarget({ kind: "device", clientId: userId });
    },
    [clients, userId]
  );

  const endDrag = useCallback(() => {
    setDragTarget(null);
    setIsDraggingListeningSource(false);
    setDevicePosition(null);
  }, [setIsDraggingListeningSource]);

  const handleGridMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragTarget || !gridRef.current || !isSpatialAudioEnabled) return;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => {
        if (!gridRef.current) return;
        const rect = gridRef.current.getBoundingClientRect();
        const x = Math.round(((e.clientX - rect.left) / rect.width) * GRID.SIZE);
        const y = Math.round(((e.clientY - rect.top) / rect.height) * GRID.SIZE);
        onGridPointerMove(x, y);
      });
    },
    [dragTarget, onGridPointerMove, isSpatialAudioEnabled]
  );

  // Non-passive touchmove: React's synthetic handler can't preventDefault()
  // here, so without this a drag on mobile scrolls the page instead.
  useEffect(() => {
    const gridElement = gridRef.current;

    const touchMoveHandler = (e: TouchEvent) => {
      if (!dragTarget || !gridElement || !e.touches[0]) return;
      e.preventDefault();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = requestAnimationFrame(() => {
        if (!gridElement || !e.touches[0]) return;
        const touch = e.touches[0];
        const rect = gridElement.getBoundingClientRect();
        const x = Math.round(((touch.clientX - rect.left) / rect.width) * GRID.SIZE);
        const y = Math.round(((touch.clientY - rect.top) / rect.height) * GRID.SIZE);
        onGridPointerMove(x, y);
      });
    };

    if (dragTarget && gridElement) {
      gridElement.addEventListener("touchmove", touchMoveHandler, { passive: false });
    }

    return () => {
      if (gridElement) gridElement.removeEventListener("touchmove", touchMoveHandler);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [dragTarget, onGridPointerMove]);

  // Releasing outside the grid still ends the drag.
  useEffect(() => {
    if (!dragTarget) return;
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);
    return () => {
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchend", endDrag);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [dragTarget, endDrag]);

  // A breakpoint crossing remounts this component (RoomShell swaps trees at
  // useIsDesktop's threshold). If that happens mid-drag, no pointer-up ever
  // fires, so isDraggingListeningSource would stay stuck true in global
  // state and permanently suppress server position adoption. Clear it here.
  useEffect(() => {
    return () => setIsDraggingListeningSource(false);
  }, [setIsDraggingListeningSource]);

  const clientsWithData = useMemo(
    () =>
      clients.map((client, i) => ({
        client,
        isCurrentUser: client.clientId === userId,
        color: DEVICE_COLORS[i % DEVICE_COLORS.length],
        position:
          dragTarget?.kind === "device" &&
          dragTarget.clientId === client.clientId &&
          devicePosition
            ? devicePosition
            : client.position,
      })),
    [clients, userId, dragTarget, devicePosition]
  );

  return (
    <TooltipProvider>
      <div
        ref={gridRef}
        className={cn(
          "relative aspect-square w-full touch-none select-none overflow-hidden rounded-xl border border-border",
          "bg-[size:10%_10%] bg-[image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)]",
          isSpatialAudioEnabled ? "bg-muted/40" : "bg-muted/15 opacity-70"
        )}
        onMouseMove={handleGridMouseMove}
      >
        {clientsWithData.map(({ client, isCurrentUser, color, position }) => (
          <DeviceDot
            key={client.clientId}
            client={client}
            isCurrentUser={isCurrentUser}
            color={color}
            position={position}
            isDragging={dragTarget?.kind === "device" && dragTarget.clientId === client.clientId}
            onDragStart={handleDeviceDragStart}
            onDragEnd={endDrag}
          />
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              className="absolute z-40 cursor-move"
              style={{
                left: `${listeningSource.x}%`,
                top: `${listeningSource.y}%`,
                transform: "translate(-50%, -50%)",
                opacity: isSpatialAudioEnabled ? 1 : 0.7,
              }}
              {...(!isDraggingListeningSource && {
                animate: {
                  left: `${listeningSource.x}%`,
                  top: `${listeningSource.y}%`,
                  opacity: isSpatialAudioEnabled ? 1 : 0.7,
                },
                transition: { type: "tween", duration: 0.15, ease: "linear" },
              })}
              onMouseDown={handleSourceMouseDown}
              onMouseUp={endDrag}
              onTouchStart={handleSourceTouchStart}
              onTouchEnd={endDrag}
            >
              <div className="relative flex size-6 items-center justify-center rounded-full bg-primary/20 p-1">
                <span className="relative flex size-3">
                  {isSpatialAudioEnabled && (
                    <span
                      key={`source-ping-${animationSyncKey}`}
                      className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60"
                    />
                  )}
                  <span className="relative inline-flex size-3 rounded-full bg-primary" />
                </span>
                <HeadphonesIcon className="absolute size-2 text-primary-foreground opacity-90" />
              </div>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top">
            <div className="text-xs font-medium">Listening Source</div>
            <div className="text-xs text-muted-foreground">Drag to reposition</div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};
