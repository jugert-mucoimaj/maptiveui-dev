"use client";

import React, {
  useRef,
  useCallback,
  useState,
  useEffect,
  forwardRef,
  type ReactNode,
} from "react";
import type { TunableControls } from "./types";

interface TunablePanelProps {
  label: string;
  controls: TunableControls;
  values: Record<string, number | string>;
  initialPosition: { x: number; y: number };
  onLiveChange: (key: string, value: number | string) => void;
  onCommitChange: (key: string, value: number | string) => void;
  onInstantChange: (key: string, value: number | string) => void;
  onDragStart: () => void;
  onClose: () => void;
  onCopyCSS: () => Promise<boolean>;
  onCopyTailwind: () => Promise<boolean>;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

const TOKENS = {
  // Deep, slightly iridescent base
  bgBase: "rgba(8, 6, 22, 0.78)",
  bgBaseSolid: "rgba(8, 6, 22, 0.95)",

  // Gradient stops for the border ring
  borderGradient:
    "linear-gradient(135deg, rgba(165, 180, 252, 0.45), rgba(139, 92, 246, 0.15) 40%, rgba(236, 72, 153, 0.25) 70%, rgba(99, 102, 241, 0.45))",

  // Inner subtle highlight (top edge of glass)
  innerHighlight:
    "linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0) 40%)",

  // Accent colors
  accent: "#a5b4fc",
  accentBright: "#c7d2fe",
  accentDim: "rgba(165, 180, 252, 0.45)",
  textPrimary: "#e2e8f0",
  textMuted: "rgba(226, 232, 240, 0.5)",
  textSubtle: "rgba(226, 232, 240, 0.35)",
  danger: "#f87171",
  success: "#86efac",

  // Strokes
  divider: "rgba(165, 180, 252, 0.08)",
  strokeSubtle: "rgba(255, 255, 255, 0.06)",
  strokeStrong: "rgba(255, 255, 255, 0.1)",

  // Elevation
  shadowPanel:
    "0 20px 60px -16px rgba(20, 10, 50, 0.8), 0 8px 24px -8px rgba(99, 102, 241, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.2)",

  // Typography
  fontMono:
    'ui-monospace, "SF Mono", "JetBrains Mono", "Berkeley Mono", Menlo, monospace',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Panel size — constants + persistence
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_SIZE = {
  defaultWidth: 300,
  minWidth: 240,
  maxWidth: 640,
  minHeight: 220,
} as const;

type PanelSize = { width: number; height: number | null };

const PANEL_SIZE_KEY = "__tunable_v1:__panel_size";

function loadPanelSize(): PanelSize {
  const fallback: PanelSize = {
    width: PANEL_SIZE.defaultWidth,
    height: null,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(PANEL_SIZE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const width =
      typeof parsed.width === "number"
        ? Math.max(
            PANEL_SIZE.minWidth,
            Math.min(PANEL_SIZE.maxWidth, parsed.width),
          )
        : fallback.width;
    const height =
      typeof parsed.height === "number" && parsed.height >= PANEL_SIZE.minHeight
        ? parsed.height
        : null;
    return { width, height };
  } catch {
    return fallback;
  }
}

function savePanelSize(size: PanelSize): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(size));
  } catch {
    /* silent */
  }
}

// Fine-grained noise texture — adds atmosphere, sits at ~3% opacity
const NOISE_URL =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Keyframes injected once per panel mount
const PANEL_STYLES = `
@keyframes tunable-panel-in {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes tunable-badge-in {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 1; transform: translateX(0); }
}
.tunable-panel-slider::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: linear-gradient(135deg, #e0e7ff, #a5b4fc);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4), 0 0 8px rgba(139, 92, 246, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.8);
  cursor: grab;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.tunable-panel-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.6), 0 0 12px rgba(139, 92, 246, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.9);
}
.tunable-panel-slider::-webkit-slider-thumb:active {
  cursor: grabbing;
  transform: scale(1.25);
}
.tunable-panel-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #e0e7ff, #a5b4fc);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.4), 0 0 8px rgba(139, 92, 246, 0.6);
  cursor: grab;
}
.tunable-panel-scroll::-webkit-scrollbar {
  width: 6px;
}
.tunable-panel-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.tunable-panel-scroll::-webkit-scrollbar-thumb {
  background: rgba(165, 180, 252, 0.15);
  border-radius: 3px;
}
.tunable-panel-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(165, 180, 252, 0.3);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const TunablePanelInner = forwardRef<HTMLDivElement, TunablePanelProps>(
  function TunablePanelInner(
    {
      label,
      controls,
      values,
      initialPosition,
      onLiveChange,
      onCommitChange,
      onInstantChange,
      onDragStart,
      onClose,
      onCopyCSS,
      onCopyTailwind,
      onReset,
      onUndo,
      onRedo,
      canUndo,
      canRedo,
      collapsed,
      onToggleCollapse,
    },
    forwardedRef,
  ) {
    const [pos, setPos] = useState(initialPosition);
    const dragState = useRef<{
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    } | null>(null);

    useEffect(() => {
      if (!dragState.current) setPos(initialPosition);
    }, [initialPosition.x, initialPosition.y]);

    const handleHeaderPointerDown = useCallback(
      (e: React.PointerEvent) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragState.current = {
          startX: e.clientX,
          startY: e.clientY,
          origX: pos.x,
          origY: pos.y,
        };
      },
      [pos.x, pos.y],
    );

    const handleHeaderPointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!dragState.current) return;
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        setPos({
          x: dragState.current.origX + dx,
          y: dragState.current.origY + dy,
        });
      },
      [],
    );

    const handleHeaderPointerUp = useCallback(() => {
      dragState.current = null;
    }, []);

    const [cssStatus, setCssStatus] = useState<"idle" | "ok" | "err">("idle");
    const [twStatus, setTwStatus] = useState<"idle" | "ok" | "err">("idle");

    // ── Panel sizing ──
    const [size, setSize] = useState<PanelSize>(() => loadPanelSize());
    const sizeRef = useRef(size);
    sizeRef.current = size;

    const resizeState = useRef<{
      startX: number;
      startY: number;
      origWidth: number;
      origHeight: number;
    } | null>(null);
    const [resizing, setResizing] = useState(false);

    const handleResizePointerDown = useCallback(
      (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const rect = (forwardedRef as React.RefObject<HTMLDivElement>)?.current
          ?.getBoundingClientRect();
        resizeState.current = {
          startX: e.clientX,
          startY: e.clientY,
          origWidth: rect?.width ?? sizeRef.current.width,
          origHeight:
            rect?.height ?? sizeRef.current.height ?? PANEL_SIZE.minHeight,
        };
        setResizing(true);
      },
      [forwardedRef],
    );

    const handleResizePointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!resizeState.current) return;
        const dx = e.clientX - resizeState.current.startX;
        const dy = e.clientY - resizeState.current.startY;

        // Clamp to viewport so the panel can't be dragged off-screen
        const maxViewportWidth = Math.max(
          PANEL_SIZE.minWidth,
          window.innerWidth - pos.x - 8,
        );
        const maxViewportHeight = Math.max(
          PANEL_SIZE.minHeight,
          window.innerHeight - pos.y - 8,
        );

        const nextWidth = Math.max(
          PANEL_SIZE.minWidth,
          Math.min(
            Math.min(PANEL_SIZE.maxWidth, maxViewportWidth),
            resizeState.current.origWidth + dx,
          ),
        );
        const nextHeight = Math.max(
          PANEL_SIZE.minHeight,
          Math.min(maxViewportHeight, resizeState.current.origHeight + dy),
        );

        setSize({ width: nextWidth, height: nextHeight });
      },
      [pos.x, pos.y],
    );

    const handleResizePointerUp = useCallback(() => {
      if (!resizeState.current) return;
      resizeState.current = null;
      setResizing(false);
      savePanelSize(sizeRef.current);
    }, []);

    const handleCopyCSS = async () => {
      const ok = await onCopyCSS();
      setCssStatus(ok ? "ok" : "err");
      setTimeout(() => setCssStatus("idle"), 1500);
    };

    const handleCopyTW = async () => {
      const ok = await onCopyTailwind();
      setTwStatus(ok ? "ok" : "err");
      setTimeout(() => setTwStatus("idle"), 1500);
    };

    // When user has resized to a fixed height, use flex layout so
    // the scroll area grows/shrinks correctly. Otherwise, natural sizing.
    const fixedHeight = !collapsed && size.height != null;

    return (
      <>
        {/* Inject keyframes + slider styles. Safe to duplicate — browsers dedupe. */}
        <style>{PANEL_STYLES}</style>

        <div
          ref={forwardedRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            zIndex: 99999,
            boxSizing: "border-box",
            width: collapsed ? 40 : size.width,
            ...(fixedHeight
              ? {
                  height: size.height as number,
                  display: "flex",
                  flexDirection: "column",
                }
              : null),
            // Gradient-border trick: inner dark fill + outer gradient ring
            background: `
              linear-gradient(${TOKENS.bgBaseSolid}, ${TOKENS.bgBaseSolid}) padding-box,
              ${TOKENS.borderGradient} border-box
            `,
            border: "1px solid transparent",
            borderRadius: 14,
            backdropFilter: "blur(24px) saturate(180%)",
            WebkitBackdropFilter: "blur(24px) saturate(180%)",
            overflow: "hidden",
            fontFamily: TOKENS.fontMono,
            fontSize: 11,
            color: TOKENS.textPrimary,
            boxShadow: TOKENS.shadowPanel,
            // Only animate width/height when not actively resizing — otherwise
            // the transition fights the drag and feels laggy
            transition: resizing
              ? "none"
              : "width 0.22s cubic-bezier(0.4, 0, 0.2, 1), height 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            userSelect: "none",
            animation: "tunable-panel-in 0.22s cubic-bezier(0.2, 0, 0.15, 1)",
          }}
        >
          {/* Noise texture + inner top highlight — decorative overlays.
              pointer-events:none so they don't intercept anything. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              backgroundImage: NOISE_URL,
              opacity: 0.035,
              mixBlendMode: "overlay",
              borderRadius: "inherit",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              background: TOKENS.innerHighlight,
              borderRadius: "inherit",
            }}
          />

          {/* Header */}
          <div
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerUp}
            onLostPointerCapture={handleHeaderPointerUp}
            style={{
              position: "relative",
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: collapsed ? "10px 8px" : "10px 12px 10px 14px",
              borderBottom: collapsed ? "none" : `1px solid ${TOKENS.divider}`,
              cursor: dragState.current ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            {/* Vertical gradient accent bar on left edge when expanded */}
            {!collapsed && (
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  top: 8,
                  bottom: 8,
                  width: 2,
                  borderRadius: 2,
                  background:
                    "linear-gradient(180deg, #818cf8, #a5b4fc 40%, #f0abfc)",
                  boxShadow: "0 0 8px rgba(165, 180, 252, 0.6)",
                }}
              />
            )}

            {!collapsed && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: TOKENS.accent,
                      opacity: 0.85,
                    }}
                  >
                    ◆
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 9.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.18em",
                      color: TOKENS.accentBright,
                    }}
                  >
                    {label}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 3 }}>
                  <PanelBtn onClick={onToggleCollapse} title="Collapse">
                    ‹
                  </PanelBtn>
                  <PanelBtn onClick={onClose} title="Close (Esc)">
                    ✕
                  </PanelBtn>
                </div>
              </>
            )}
            {collapsed && (
              <PanelBtn onClick={onToggleCollapse} title="Expand" large>
                ◆
              </PanelBtn>
            )}
          </div>

          {!collapsed && (
            <>
              {/* Controls */}
              <div
                className="tunable-panel-scroll"
                style={{
                  position: "relative",
                  padding: "14px 14px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                  overflowY: "auto",
                  ...(fixedHeight
                    ? { flex: 1, minHeight: 0 }
                    : { maxHeight: 440 }),
                }}
              >
                {Object.entries(controls).map(([key, control]) => {
                  const controlLabel =
                    control.label ||
                    key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (s) => s.toUpperCase());

                  switch (control.type) {
                    case "range":
                      return (
                        <RangeSlider
                          key={key}
                          controlKey={key}
                          control={control}
                          label={controlLabel}
                          initialValue={values[key] as number}
                          onLiveChange={onLiveChange}
                          onCommitChange={onCommitChange}
                          onDragStart={onDragStart}
                        />
                      );

                    case "color":
                      return (
                        <ColorInput
                          key={key}
                          controlKey={key}
                          label={controlLabel}
                          value={values[key] as string}
                          onInstantChange={onInstantChange}
                        />
                      );

                    case "select": {
                      const val = values[key] as string;
                      return (
                        <div key={key}>
                          <FieldLabel>{controlLabel}</FieldLabel>
                          <select
                            value={val}
                            onChange={(e) =>
                              onInstantChange(key, e.target.value)
                            }
                            style={{
                              width: "100%",
                              padding: "6px 10px",
                              background: "rgba(255, 255, 255, 0.03)",
                              border: `1px solid ${TOKENS.strokeSubtle}`,
                              borderRadius: 7,
                              color: TOKENS.textPrimary,
                              fontSize: 11,
                              fontFamily: "inherit",
                              outline: "none",
                              cursor: "pointer",
                              marginTop: 6,
                            }}
                          >
                            {control.options?.map((opt) => (
                              <option
                                key={opt}
                                value={opt}
                                style={{ background: "#0f0a2e" }}
                              >
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }

                    case "toggle": {
                      const isOn =
                        values[key] === 1 || values[key] === "1";
                      return (
                        <div
                          key={key}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <FieldLabel inline>{controlLabel}</FieldLabel>
                          <button
                            onClick={() =>
                              onInstantChange(key, isOn ? 0 : 1)
                            }
                            style={{
                              width: 34,
                              height: 18,
                              borderRadius: 9,
                              border: "none",
                              background: isOn
                                ? "linear-gradient(135deg, #818cf8, #a855f7)"
                                : "rgba(255, 255, 255, 0.08)",
                              boxShadow: isOn
                                ? "0 0 12px rgba(139, 92, 246, 0.5), inset 0 1px 1px rgba(255,255,255,0.2)"
                                : "inset 0 1px 2px rgba(0, 0, 0, 0.3)",
                              cursor: "pointer",
                              position: "relative",
                              transition:
                                "background 0.2s ease, box-shadow 0.2s ease",
                              padding: 0,
                            }}
                          >
                            <div
                              style={{
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                background:
                                  "linear-gradient(135deg, #ffffff, #e0e7ff)",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                                position: "absolute",
                                top: 3,
                                left: isOn ? 19 : 3,
                                transition:
                                  "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                              }}
                            />
                          </button>
                        </div>
                      );
                    }

                    default:
                      return null;
                  }
                })}
              </div>

              {/* Action bar */}
              <div
                style={{
                  position: "relative",
                  flexShrink: 0,
                  padding: "10px 12px",
                  paddingRight: 22, // leave room for the resize grip
                  borderTop: `1px solid ${TOKENS.divider}`,
                  display: "flex",
                  gap: 4,
                  flexWrap: "wrap",
                  background: "rgba(0, 0, 0, 0.15)",
                }}
              >
                <ActionBtn
                  onClick={handleCopyCSS}
                  status={cssStatus}
                  label={
                    cssStatus === "ok"
                      ? "✓ Copied"
                      : cssStatus === "err"
                        ? "✗ Failed"
                        : "Copy CSS"
                  }
                />
                <ActionBtn
                  onClick={handleCopyTW}
                  status={twStatus}
                  label={
                    twStatus === "ok"
                      ? "✓ Copied"
                      : twStatus === "err"
                        ? "✗ Failed"
                        : "Copy TW"
                  }
                />
                <ActionBtn onClick={onReset} label="Reset" />
                <ActionBtn
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo (⌘Z)"
                  label="↩"
                  compact
                />
                <ActionBtn
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo (⌘⇧Z)"
                  label="↪"
                  compact
                />
              </div>

              {/* Resize grip — bottom-right corner */}
              <ResizeGrip
                active={resizing}
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
              />
            </>
          )}
        </div>
      </>
    );
  },
);

export const TunablePanel = React.memo(TunablePanelInner);

// ─────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ─────────────────────────────────────────────────────────────────────────────

function FieldLabel({
  children,
  inline,
}: {
  children: ReactNode;
  inline?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: TOKENS.textMuted,
        display: inline ? "inline" : "block",
      }}
    >
      {children}
    </span>
  );
}

function FieldValue({
  children,
  valid = true,
}: {
  children: ReactNode;
  valid?: boolean;
}) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: valid ? TOKENS.accentBright : TOKENS.danger,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.02em",
      }}
    >
      {children}
    </span>
  );
}

const RangeSlider = React.memo(function RangeSlider({
  controlKey,
  control,
  label,
  initialValue,
  onLiveChange,
  onCommitChange,
  onDragStart,
}: {
  controlKey: string;
  control: any;
  label: string;
  initialValue: number;
  onLiveChange: (key: string, value: number | string) => void;
  onCommitChange: (key: string, value: number | string) => void;
  onDragStart: () => void;
}) {
  const min = control.min ?? 0;
  const max = control.max ?? 100;
  const step = control.step ?? 1;
  const unit = control.unit || "px";
  const target = control.maps || controlKey;

  const displayUnit =
    target === "depth" ||
    target === "boxShadow" ||
    target === "glow" ||
    target === "blur"
      ? ""
      : unit === "none"
        ? ""
        : unit;

  const [displayVal, setDisplayVal] = useState(initialValue);
  const isDragging = useRef(false);
  const displayValRef = useRef(displayVal);
  displayValRef.current = displayVal;

  useEffect(() => {
    if (!isDragging.current) setDisplayVal(initialValue);
  }, [initialValue]);

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = parseFloat(e.target.value);
      setDisplayVal(num);
      onLiveChange(controlKey, num);
    },
    [controlKey, onLiveChange],
  );

  const handlePointerDown = useCallback(() => {
    isDragging.current = true;
    onDragStart();
  }, [onDragStart]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
    onCommitChange(controlKey, displayValRef.current);
  }, [controlKey, onCommitChange]);

  const pct = ((displayVal - min) / (max - min)) * 100;
  const formattedVal =
    typeof displayVal === "number" && displayVal % 1 !== 0
      ? displayVal.toFixed(2)
      : displayVal;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <FieldLabel>{label}</FieldLabel>
        <FieldValue>
          {formattedVal}
          <span style={{ opacity: 0.5, marginLeft: 1 }}>{displayUnit}</span>
        </FieldValue>
      </div>
      <input
        type="range"
        className="tunable-panel-slider"
        min={min}
        max={max}
        step={step}
        value={displayVal}
        onInput={handleInput as any}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onLostPointerCapture={handlePointerUp}
        style={{
          width: "100%",
          height: 6,
          appearance: "none",
          WebkitAppearance: "none",
          background: `linear-gradient(90deg,
            #a5b4fc 0%,
            #818cf8 ${pct}%,
            rgba(255, 255, 255, 0.06) ${pct}%,
            rgba(255, 255, 255, 0.06) 100%)`,
          borderRadius: 4,
          outline: "none",
          cursor: "pointer",
          boxShadow:
            "inset 0 1px 2px rgba(0, 0, 0, 0.3), 0 0 12px rgba(139, 92, 246, 0.1)",
        }}
      />
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Color math
// ─────────────────────────────────────────────────────────────────────────────

type RGBA = { r: number; g: number; b: number; a: number };
type HSVA = { h: number; s: number; v: number; a: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255,
    gn = g / 255,
    bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rn) h = 60 * (((gn - bn) / d) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / d + 2);
    else h = 60 * ((rn - gn) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = max * 100;
  return [h, s, v];
}

function hsvToRgb(
  h: number,
  s: number,
  v: number,
): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = vn - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/**
 * Parse any CSS color string into RGBA. Uses browser's computed-style
 * resolution as a fallback, so named colors, color-mix(), etc. all work.
 */
function parseColor(input: string): RGBA | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;

  if (s === "transparent")
    return { r: 0, g: 0, b: 0, a: 0 };

  // Hex (3, 4, 6, or 8 chars)
  const hex = /^#?([0-9a-f]{3,8})$/i.exec(s);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0] + h[0], 16);
      const g = parseInt(h[1] + h[1], 16);
      const b = parseInt(h[2] + h[2], 16);
      const a = h.length === 4 ? parseInt(h[3] + h[3], 16) / 255 : 1;
      return { r, g, b, a };
    }
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  // rgb/rgba
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const parts = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(parseFloat);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n))) {
      return {
        r: clamp(Math.round(parts[0]), 0, 255),
        g: clamp(Math.round(parts[1]), 0, 255),
        b: clamp(Math.round(parts[2]), 0, 255),
        a: parts[3] == null || isNaN(parts[3]) ? 1 : clamp(parts[3], 0, 1),
      };
    }
  }

  // Browser fallback: parse via computed style (handles named colors, hsl(), etc.)
  if (typeof document !== "undefined") {
    try {
      const probe = document.createElement("div");
      probe.style.color = "rgb(0, 0, 0)";
      probe.style.color = s;
      if (probe.style.color === "") return null;
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      document.body.removeChild(probe);
      const m = /^rgba?\(([^)]+)\)$/i.exec(computed);
      if (m) {
        const parts = m[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map(parseFloat);
        if (parts.length >= 3) {
          return {
            r: Math.round(parts[0]),
            g: Math.round(parts[1]),
            b: Math.round(parts[2]),
            a: parts[3] == null ? 1 : parts[3],
          };
        }
      }
    } catch {
      /* fall through */
    }
  }
  return null;
}

function toHex(n: number): string {
  return clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
}

/** Serialize as hex when opaque, rgba() otherwise. */
function formatColor({ r, g, b, a }: RGBA): string {
  if (a >= 1) return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  if (a <= 0) return "transparent";
  const aRounded = Math.round(a * 1000) / 1000;
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${aRounded})`;
}

function isValidColor(v: string): boolean {
  if (typeof v !== "string" || v.trim() === "") return false;
  if (typeof CSS !== "undefined" && typeof CSS.supports === "function") {
    try {
      return CSS.supports("color", v);
    } catch {
      /* fall through */
    }
  }
  return parseColor(v) !== null;
}

// Checkerboard background for transparency preview
const CHECKER_BG = {
  backgroundImage: `linear-gradient(45deg, #333 25%, transparent 25%),
    linear-gradient(-45deg, #333 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #333 75%),
    linear-gradient(-45deg, transparent 75%, #333 75%)`,
  backgroundSize: "8px 8px",
  backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
};

// Curated preset palette — covers a designer's likely starting points
const PRESETS: string[] = [
  "transparent",
  "#ffffff",
  "#e5e7eb",
  "#6b7280",
  "#111827",
  "#000000",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
];

// ─────────────────────────────────────────────────────────────────────────────
// ColorInput — label + swatch + text input + collapsible custom picker
// ─────────────────────────────────────────────────────────────────────────────

const ColorInput = React.memo(function ColorInput({
  controlKey,
  label,
  value,
  onInstantChange,
}: {
  controlKey: string;
  label: string;
  value: string;
  onInstantChange: (key: string, value: number | string) => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setText(value);
  }, [value]);

  const valid = isValidColor(text);
  const parsed = parseColor(valid ? text : value);
  const previewColor = valid ? text : value;

  const commit = useCallback(
    (next: string) => {
      setText(next);
      onInstantChange(controlKey, next);
    },
    [controlKey, onInstantChange],
  );

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setText(next);
    if (isValidColor(next)) onInstantChange(controlKey, next);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <FieldLabel>{label}</FieldLabel>
        <FieldValue valid={valid}>{valid ? text : "invalid"}</FieldValue>
      </div>
      <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
        {/* Swatch — opens the full picker on click */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={open ? "Close picker" : "Open color picker"}
          style={{
            position: "relative",
            width: 30,
            height: 30,
            borderRadius: 7,
            overflow: "hidden",
            flexShrink: 0,
            border: "none",
            cursor: "pointer",
            padding: 0,
            boxShadow: open
              ? `inset 0 0 0 2px ${TOKENS.accent}, 0 2px 6px rgba(0,0,0,0.3)`
              : "inset 0 0 0 1px rgba(255,255,255,0.1), 0 2px 6px rgba(0,0,0,0.3)",
            transition: "box-shadow 0.15s ease",
          }}
        >
          <div aria-hidden style={{ position: "absolute", inset: 0, ...CHECKER_BG }} />
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              background: previewColor,
            }}
          />
        </button>
        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          spellCheck={false}
          style={{
            flex: 1,
            padding: "7px 10px",
            background: "rgba(255, 255, 255, 0.03)",
            border: valid
              ? `1px solid ${TOKENS.strokeSubtle}`
              : "1px solid rgba(248, 113, 113, 0.5)",
            borderRadius: 7,
            color: TOKENS.textPrimary,
            fontSize: 11,
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color 0.15s ease",
          }}
        />
      </div>

      {open && parsed && (
        <ColorPickerPopover initial={parsed} onChange={(c) => commit(formatColor(c))} />
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// ColorPickerPopover — SV square + hue + alpha + eyedropper + presets
// ─────────────────────────────────────────────────────────────────────────────

function ColorPickerPopover({
  initial,
  onChange,
}: {
  initial: RGBA;
  onChange: (c: RGBA) => void;
}) {
  // Keep HSV as the source of truth for the picker UI — avoids drift
  // through hue when saturation or value hits 0.
  const [hsv, setHsv] = useState<HSVA>(() => {
    const [h, s, v] = rgbToHsv(initial.r, initial.g, initial.b);
    return { h, s, v, a: initial.a };
  });

  // Mirror into a ref so `update` can read the current value without
  // nesting a setState inside another setState's updater. React strict
  // mode / concurrent reconciliation can run updaters during render,
  // and calling the parent's onChange from inside one triggers
  // "can't update a component while rendering" errors.
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // Only sync from `initial` when the prop's RGB actually changes to a value
  // that doesn't already match our internal HSV — otherwise dragging at S=0
  // or V=0 would reset hue, which is jarring.
  useEffect(() => {
    const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v);
    const same =
      Math.abs(r - initial.r) <= 1 &&
      Math.abs(g - initial.g) <= 1 &&
      Math.abs(b - initial.b) <= 1 &&
      Math.abs(hsv.a - initial.a) < 0.01;
    if (!same) {
      const [h2, s2, v2] = rgbToHsv(initial.r, initial.g, initial.b);
      setHsv({ h: h2, s: s2, v: v2, a: initial.a });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.r, initial.g, initial.b, initial.a]);

  const update = useCallback(
    (patch: Partial<HSVA>) => {
      const next = { ...hsvRef.current, ...patch };
      hsvRef.current = next;
      setHsv(next);
      const [r, g, b] = hsvToRgb(next.h, next.s, next.v);
      // Called at the top level — not nested inside a setState updater
      onChange({ r, g, b, a: next.a });
    },
    [onChange],
  );

  // EyeDropper support — Chrome/Edge/Opera. Check at render time.
  const hasEyeDropper =
    typeof window !== "undefined" && "EyeDropper" in window;

  const pickFromScreen = async () => {
    if (!hasEyeDropper) return;
    try {
      const EyeDropperCtor = (window as any).EyeDropper;
      const result = await new EyeDropperCtor().open();
      const parsed = parseColor(result.sRGBHex);
      if (parsed) {
        const [h, s, v] = rgbToHsv(parsed.r, parsed.g, parsed.b);
        // Preserve the user's current alpha — eyedropper only samples RGB
        update({ h, s, v });
      }
    } catch {
      // User canceled or API failed — ignore
    }
  };

  const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hueColor = `hsl(${hsv.h}, 100%, 50%)`;
  const rgbaCurrent = `rgba(${r}, ${g}, ${b}, ${hsv.a})`;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 10,
        background: "rgba(0, 0, 0, 0.25)",
        border: `1px solid ${TOKENS.divider}`,
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
      // Keep clicks inside the picker from closing the whole panel
      onClick={(e) => e.stopPropagation()}
    >
      {/* SV square */}
      <SVSquare
        hue={hsv.h}
        s={hsv.s}
        v={hsv.v}
        onChange={(s, v) => update({ s, v })}
      />

      {/* Hue slider */}
      <TrackSlider
        ariaLabel="Hue"
        value={hsv.h}
        min={0}
        max={360}
        onChange={(h) => update({ h })}
        trackStyle={{
          background:
            "linear-gradient(90deg, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
        }}
        thumbColor={hueColor}
      />

      {/* Alpha slider */}
      <TrackSlider
        ariaLabel="Alpha"
        value={hsv.a * 100}
        min={0}
        max={100}
        onChange={(pct) => update({ a: pct / 100 })}
        trackStyle={{
          ...CHECKER_BG,
          backgroundBlendMode: "normal",
        }}
        trackOverlayStyle={{
          background: `linear-gradient(90deg, rgba(${r},${g},${b},0) 0%, rgba(${r},${g},${b},1) 100%)`,
        }}
        thumbColor={rgbaCurrent}
      />

      {/* Eyedropper + current color chip */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <div
          aria-hidden
          style={{
            position: "relative",
            width: 22,
            height: 22,
            borderRadius: 5,
            overflow: "hidden",
            flexShrink: 0,
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.1)",
          }}
        >
          <div style={{ position: "absolute", inset: 0, ...CHECKER_BG }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: rgbaCurrent,
            }}
          />
        </div>
        <span
          style={{
            fontSize: 10,
            color: TOKENS.textMuted,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.02em",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {formatColor({ r, g, b, a: hsv.a })}
        </span>
        {hasEyeDropper && (
          <button
            type="button"
            onClick={pickFromScreen}
            title="Pick a color from screen"
            style={{
              width: 22,
              height: 22,
              border: `1px solid ${TOKENS.strokeSubtle}`,
              background: "rgba(255,255,255,0.04)",
              borderRadius: 5,
              cursor: "pointer",
              color: TOKENS.accentBright,
              fontSize: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ⊙
          </button>
        )}
      </div>

      {/* Preset swatches */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(8, 1fr)",
          gap: 4,
        }}
      >
        {PRESETS.map((c) => (
          <PresetSwatch
            key={c}
            color={c}
            onPick={() => {
              const p = parseColor(c);
              if (!p) return;
              if (c === "transparent") {
                // Keep existing hue when jumping to transparent
                update({ a: 0 });
                return;
              }
              const [h, s, v] = rgbToHsv(p.r, p.g, p.b);
              update({ h, s, v, a: p.a });
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SV square — drag handle over saturation/value plane
// ─────────────────────────────────────────────────────────────────────────────

function SVSquare({
  hue,
  s,
  v,
  onChange,
}: {
  hue: number;
  s: number;
  v: number;
  onChange: (s: number, v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const xPct = clamp((clientX - rect.left) / rect.width, 0, 1);
      const yPct = clamp((clientY - rect.top) / rect.height, 0, 1);
      onChange(xPct * 100, (1 - yPct) * 100);
    },
    [onChange],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    update(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    update(e.clientX, e.clientY);
  };

  return (
    <div
      ref={ref}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      style={{
        position: "relative",
        width: "100%",
        height: 130,
        borderRadius: 6,
        background: `hsl(${hue}, 100%, 50%)`,
        cursor: "crosshair",
        touchAction: "none",
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      {/* White horizontal gradient: saturation */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, #fff 0%, transparent 100%)",
        }}
      />
      {/* Black vertical gradient: value */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(0deg, #000 0%, transparent 100%)",
        }}
      />
      {/* Handle */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${s}%`,
          top: `${100 - v}%`,
          width: 12,
          height: 12,
          borderRadius: "50%",
          border: "2px solid #fff",
          transform: "translate(-50%, -50%)",
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Track slider — shared pattern for hue & alpha
// ─────────────────────────────────────────────────────────────────────────────

function TrackSlider({
  ariaLabel,
  value,
  min,
  max,
  onChange,
  trackStyle,
  trackOverlayStyle,
  thumbColor,
}: {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  trackStyle: React.CSSProperties;
  trackOverlayStyle?: React.CSSProperties;
  thumbColor: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const update = useCallback(
    (clientX: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      onChange(min + pct * (max - min));
    },
    [min, max, onChange],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    update(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    update(e.clientX);
  };

  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      style={{
        position: "relative",
        height: 12,
        borderRadius: 6,
        cursor: "pointer",
        touchAction: "none",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
        ...trackStyle,
      }}
    >
      {trackOverlayStyle && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            ...trackOverlayStyle,
          }}
        />
      )}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${pct}%`,
          top: "50%",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: "2px solid #fff",
          background: thumbColor,
          transform: "translate(-50%, -50%)",
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset swatch
// ─────────────────────────────────────────────────────────────────────────────

function PresetSwatch({
  color,
  onPick,
}: {
  color: string;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      title={color}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        minHeight: 18,
        border: "none",
        borderRadius: 4,
        padding: 0,
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: hover
          ? `inset 0 0 0 1px ${TOKENS.accent}, 0 0 0 2px rgba(165,180,252,0.2)`
          : "inset 0 0 0 1px rgba(255,255,255,0.08)",
        transition: "box-shadow 0.12s ease",
      }}
    >
      <div aria-hidden style={{ position: "absolute", inset: 0, ...CHECKER_BG }} />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: color,
        }}
      />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────────────────────

function PanelBtn({
  onClick,
  children,
  title,
  large,
}: {
  onClick: () => void;
  children: ReactNode;
  title?: string;
  large?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const size = large ? 24 : 20;
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: size,
        height: size,
        border: "none",
        background: hover
          ? "linear-gradient(135deg, rgba(165, 180, 252, 0.25), rgba(139, 92, 246, 0.25))"
          : "rgba(255, 255, 255, 0.04)",
        borderRadius: 5,
        color: hover ? TOKENS.accentBright : TOKENS.textMuted,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: large ? 12 : 11,
        fontWeight: 700,
        transition: "background 0.14s ease, color 0.14s ease",
      }}
    >
      {children}
    </button>
  );
}

function ActionBtn({
  onClick,
  label,
  disabled,
  title,
  status,
  compact,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
  status?: "idle" | "ok" | "err";
  compact?: boolean;
}) {
  const [hover, setHover] = useState(false);

  const color =
    status === "ok"
      ? TOKENS.success
      : status === "err"
        ? TOKENS.danger
        : disabled
          ? TOKENS.textSubtle
          : hover
            ? TOKENS.accentBright
            : "#c7d2fe";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: compact ? "5px 8px" : "5px 10px",
        minWidth: compact ? 26 : "auto",
        border: `1px solid ${
          hover && !disabled
            ? "rgba(165, 180, 252, 0.3)"
            : TOKENS.strokeSubtle
        }`,
        background:
          hover && !disabled
            ? "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15))"
            : "rgba(255, 255, 255, 0.02)",
        borderRadius: 6,
        color,
        cursor: disabled ? "default" : "pointer",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: compact ? 0 : "0.04em",
        fontFamily: "inherit",
        transition: "all 0.14s ease",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resize grip — bottom-right corner drag handle
// ─────────────────────────────────────────────────────────────────────────────

function ResizeGrip({
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  active: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const visible = hover || active;
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label="Resize panel"
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: 18,
        height: 18,
        cursor: "nwse-resize",
        touchAction: "none",
        zIndex: 10,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "flex-end",
        padding: 3,
        color: visible ? TOKENS.accentBright : TOKENS.accent,
        opacity: visible ? 0.9 : 0.45,
        transition: "opacity 0.12s ease, color 0.12s ease",
      }}
    >
      {/* Two short diagonal strokes — classic corner grip */}
      <svg width="12" height="12" style={{ display: "block" }} aria-hidden>
        <line
          x1="3"
          y1="11"
          x2="11"
          y2="3"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
        <line
          x1="7"
          y1="11"
          x2="11"
          y2="7"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
