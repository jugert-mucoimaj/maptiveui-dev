"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  type ReactNode,
  type ElementType,
} from "react";
import { createPortal } from "react-dom";
import { TunablePanel } from "./TunablePanel";
import { computeStyle, styleToCSS } from "./computeStyle";
import type { TunableControl, TunableControls } from "./types";

interface TunableProps {
  children: ReactNode;
  controls: TunableControls;
  label?: string;
  enabled?: boolean;
  panelPosition?: "right" | "left" | "bottom";
  collapsed?: boolean;
  /**
   * HTML element tag for the wrapper. Defaults to "div".
   * Use "span" for inline contexts, "tr" for table rows, etc.
   */
  as?: ElementType;
  /**
   * If set, current values are persisted to localStorage under this key.
   */
  persistKey?: string;
}

const PERSIST_VERSION = 1;
const STORAGE_PREFIX = `__tunable_v${PERSIST_VERSION}:`;

type Values = Record<string, number | string>;

function buildInitialValues(
  controls: TunableControls,
  persistKey: string | undefined,
): Values {
  const defaults: Values = {};
  for (const [key, control] of Object.entries(controls)) {
    defaults[key] = control.default ?? getControlDefault(control);
  }
  if (persistKey) {
    const loaded = loadPersisted(persistKey, controls);
    if (loaded) return { ...defaults, ...loaded };
  }
  return defaults;
}

function loadPersisted(
  key: string,
  controls: TunableControls,
): Values | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const result: Values = {};
    for (const k of Object.keys(controls)) {
      if (k in parsed) result[k] = parsed[k];
    }
    return result;
  } catch {
    return null;
  }
}

function savePersisted(key: string, values: Values): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + key,
      JSON.stringify(values),
    );
  } catch {
    /* silent */
  }
}

export function Tunable({
  children,
  controls,
  label,
  // Default to development mode. `process` is only defined when a bundler
  // (Next.js, Vite, etc.) substitutes `process.env.NODE_ENV` at build time;
  // reading via globalThis + optional chaining keeps this safe in any
  // environment including raw browser ESM where `process` doesn't exist.
  enabled = (globalThis as any)?.process?.env?.NODE_ENV === "development",
  panelPosition = "right",
  collapsed: initialCollapsed = false,
  as,
  persistKey,
}: TunableProps) {
  const [values, setValues] = useState<Values>(() =>
    buildInitialValues(controls, persistKey),
  );

  const [history, setHistory] = useState<Values[]>(() => [
    buildInitialValues(controls, persistKey),
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [isHovered, setIsHovered] = useState(false);
  const [isSelected, setIsSelected] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [isDragging, setIsDragging] = useState(false);
  // Alt/Option key is the "inspect modifier" — held-down arms clicks to select
  const [altHeld, setAltHeld] = useState(false);

  const historyRef = useRef(history);
  historyRef.current = history;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const isDraggingRef = useRef(isDragging);
  isDraggingRef.current = isDragging;

  const wrapperRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const liveValuesRef = useRef<Values>(values);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    liveValuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (persistKey) savePersisted(persistKey, values);
  }, [persistKey, values]);

  const [panelInitPos, setPanelInitPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const computePanelPos = useCallback((): { x: number; y: number } | null => {
    if (!wrapperRef.current) return null;
    const rect = wrapperRef.current.getBoundingClientRect();
    const PANEL_WIDTH = 300;
    const PANEL_MIN_HEIGHT = 200;
    const GAP = 16;

    let x: number;
    let y: number;

    if (panelPosition === "left") {
      x = rect.left - PANEL_WIDTH - GAP;
      y = rect.top;
    } else if (panelPosition === "bottom") {
      x = rect.left;
      y = rect.bottom + GAP;
    } else {
      x = rect.right + GAP;
      y = rect.top;
    }

    x = Math.max(8, Math.min(x, window.innerWidth - PANEL_WIDTH - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - PANEL_MIN_HEIGHT));
    return { x, y };
  }, [panelPosition]);

  useEffect(() => {
    if (!isSelected) return;
    const handler = () => {
      const next = computePanelPos();
      if (next) setPanelInitPos(next);
    };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [isSelected, computePanelPos]);

  useEffect(() => {
    if (!isSelected) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (wrapperRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsSelected(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isSelected]);

  // Track Alt/Option key globally — held-down = "inspect mode" for clicks
  useEffect(() => {
    const update = (e: KeyboardEvent) => setAltHeld(e.altKey);
    // Clear state if the window loses focus while key is held (otherwise stuck)
    const clear = () => setAltHeld(false);
    window.addEventListener("keydown", update);
    window.addEventListener("keyup", update);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", update);
      window.removeEventListener("keyup", update);
      window.removeEventListener("blur", clear);
    };
  }, []);

  const commitToHistory = useCallback((next: Values) => {
    const idx = historyIndexRef.current;
    const newHistory = [...historyRef.current.slice(0, idx + 1), next];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, []);

  const applyLiveStyle = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const style = computeStyle(controls, liveValuesRef.current);
    for (const [prop, val] of Object.entries(style)) {
      (el.style as any)[prop] = val;
    }
  }, [controls]);

  const onLiveChange = useCallback(
    (key: string, value: number | string) => {
      liveValuesRef.current = { ...liveValuesRef.current, [key]: value };
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        applyLiveStyle();
        rafRef.current = null;
      });
    },
    [applyLiveStyle],
  );

  const onCommitChange = useCallback(
    (key: string, value: number | string) => {
      setIsDragging(false);
      const next: Values = { ...valuesRef.current, [key]: value };
      setValues(next);
      commitToHistory(next);
    },
    [commitToHistory],
  );

  const onInstantChange = useCallback(
    (key: string, value: number | string) => {
      const next: Values = { ...valuesRef.current, [key]: value };
      setValues(next);
      commitToHistory(next);
    },
    [commitToHistory],
  );

  const onDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const undo = useCallback(() => {
    if (isDraggingRef.current) return;
    const idx = historyIndexRef.current;
    if (idx <= 0) return;
    const nextIdx = idx - 1;
    const nextValues = historyRef.current[nextIdx];
    setHistoryIndex(nextIdx);
    setValues(nextValues);
  }, []);

  const redo = useCallback(() => {
    if (isDraggingRef.current) return;
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx >= hist.length - 1) return;
    const nextIdx = idx + 1;
    const nextValues = hist[nextIdx];
    setHistoryIndex(nextIdx);
    setValues(nextValues);
  }, []);

  const resetAll = useCallback(() => {
    const initial: Values = {};
    for (const [key, control] of Object.entries(controls)) {
      initial[key] = control.default ?? getControlDefault(control);
    }
    setValues(initial);
    liveValuesRef.current = initial;
    commitToHistory(initial);
  }, [controls, commitToHistory]);

  const writeClipboard = useCallback(
    async (text: string): Promise<boolean> => {
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          await navigator.clipboard.writeText(text);
          return true;
        }
      } catch {
        /* fall through */
      }
      return false;
    },
    [],
  );

  const copyCSS = useCallback(async (): Promise<boolean> => {
    const currentStyle = computeStyle(controls, valuesRef.current);
    return writeClipboard(styleToCSS(currentStyle));
  }, [controls, writeClipboard]);

  const copyTailwind = useCallback(async (): Promise<boolean> => {
    const currentValues = valuesRef.current;
    const tw = buildTailwindClasses(controls, currentValues);
    return writeClipboard(tw.join(" "));
  }, [controls, writeClipboard]);

  const handleClose = useCallback(() => {
    setIsSelected(false);
  }, []);

  useEffect(() => {
    if (!isSelected) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const inField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!target?.isContentEditable;

      if (e.key === "Escape") {
        setIsSelected(false);
        return;
      }
      if (inField) return;

      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isSelected, undo, redo]);

  const selectNow = useCallback(() => {
    const pos = computePanelPos();
    if (pos) setPanelInitPos(pos);
    setIsSelected(true);
  }, [computePanelPos]);

  const handleWrapperClick = useCallback(
    (e: React.MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (isSelected) return;

      // Only hijack the click when Alt is held — otherwise pass through
      // so buttons, links, and forms inside the wrapper work normally.
      if (!e.altKey) return;

      e.preventDefault();
      e.stopPropagation();
      selectNow();
    },
    [isSelected, selectNow],
  );

  const handleBadgeClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isSelected) return;
      selectNow();
    },
    [isSelected, selectNow],
  );

  if (!enabled) {
    return <>{children}</>;
  }

  const computedStyle = computeStyle(controls, values);
  const WrapperEl: ElementType = as ?? "div";
  const showAccent = isHovered || isSelected;
  // "Armed": Alt is held AND we're hovering this particular Tunable.
  // Telegraphs "a click here will select, not pass through."
  const armed = altHeld && isHovered && !isSelected;
  const badgeText = label || "tune";

  return (
    <WrapperEl
      ref={wrapperRef as any}
      data-tunable-wrapper=""
      className="tunable-wrapper"
      style={{
        position: "relative",
        ...computedStyle,
        // Only override cursor when armed — otherwise respect user's cursor
        ...(armed ? { cursor: "crosshair" } : null),
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleWrapperClick}
    >
      {children}

      {/* Decorative overlay — hover/selection visuals.
          Kept separate from user's computed styles so it never conflicts
          with box-shadow / outline controls. */}
      {showAccent && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -6,
            pointerEvents: "none",
            boxSizing: "border-box",
            borderRadius: "inherit",
            border: isSelected
              ? "2px solid rgba(165, 180, 252, 0.95)"
              : armed
                ? "2px solid rgba(165, 180, 252, 0.85)"
                : "2px dashed rgba(165, 180, 252, 0.7)",
            boxShadow: isSelected
              ? "0 0 0 4px rgba(99, 102, 241, 0.12), 0 12px 48px -12px rgba(139, 92, 246, 0.55), inset 0 0 0 1px rgba(255, 255, 255, 0.03)"
              : armed
                ? "0 0 0 4px rgba(99, 102, 241, 0.14), 0 10px 36px -10px rgba(139, 92, 246, 0.45)"
                : "0 0 0 3px rgba(99, 102, 241, 0.08), 0 8px 32px -12px rgba(99, 102, 241, 0.35)",
            transition: "border-color 0.18s ease, box-shadow 0.18s ease",
            zIndex: 9997,
          }}
        />
      )}

      {/* Label badge — clickable "tune" affordance.
          Works as a mouse-only path for users who don't know the Alt modifier. */}
      {showAccent && (
        <button
          type="button"
          onClick={handleBadgeClick}
          title={`Click to tune (or ⌥+click the element)`}
          style={{
            position: "absolute",
            top: -30,
            left: -4,
            padding: "3px 10px 3px 8px",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#0f0a2e",
            background:
              "linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 55%, #818cf8 100%)",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            pointerEvents: "auto",
            zIndex: 9998,
            fontFamily:
              'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
            boxShadow:
              "0 6px 16px -4px rgba(99, 102, 241, 0.5), inset 0 0 0 1px rgba(255, 255, 255, 0.15)",
            whiteSpace: "nowrap",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            lineHeight: 1.4,
            transition: "transform 0.12s ease, box-shadow 0.12s ease",
            transform: armed ? "translateY(-1px) scale(1.03)" : undefined,
          }}
        >
          <span style={{ fontSize: 8, opacity: 0.8 }}>◆</span>
          {badgeText}
        </button>
      )}

      {isSelected &&
        panelInitPos &&
        typeof document !== "undefined" &&
        createPortal(
          <TunablePanel
            ref={panelRef}
            label={label || "Tunable"}
            controls={controls}
            values={values}
            initialPosition={panelInitPos}
            onLiveChange={onLiveChange}
            onCommitChange={onCommitChange}
            onInstantChange={onInstantChange}
            onDragStart={onDragStart}
            onClose={handleClose}
            onCopyCSS={copyCSS}
            onCopyTailwind={copyTailwind}
            onReset={resetAll}
            onUndo={undo}
            onRedo={redo}
            canUndo={historyIndex > 0}
            canRedo={historyIndex < history.length - 1}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
          />,
          document.body,
        )}
    </WrapperEl>
  );
}

function getControlDefault(control: TunableControl): number | string {
  switch (control.type) {
    case "color":
      return "#ffffff";
    case "range":
      return control.min ?? 0;
    case "select":
      return control.options?.[0] ?? "";
    case "toggle":
      return 0;
  }
  const _exhaustive: never = control;
  throw new Error(
    `[Tunable] Unknown control type: ${String((_exhaustive as any)?.type)}`,
  );
}

function buildTailwindClasses(
  controls: TunableControls,
  values: Values,
): string[] {
  const tw: string[] = [];
  for (const [key, control] of Object.entries(controls)) {
    const val = values[key];
    const target = control.maps || key;
    const kebab = target.replace(/([A-Z])/g, "-$1").toLowerCase();

    if (control.type === "color") {
      if (target === "color") tw.push(`text-[${val}]`);
      else if (target === "borderColor") tw.push(`border-[${val}]`);
      else if (target === "background" || target === "backgroundColor")
        tw.push(`bg-[${val}]`);
      else {
        warnUnmapped(target);
        tw.push(`[${kebab}:${val}]`);
      }
      continue;
    }

    if (control.type === "range") {
      const unit = control.unit || "px";
      const suffix = unit === "none" || unit === "" ? "" : unit;
      const mapped: Record<string, string> = {
        borderRadius: `rounded-[${val}${suffix}]`,
        width: `w-[${val}${suffix}]`,
        height: `h-[${val}${suffix}]`,
        padding: `p-[${val}${suffix}]`,
        paddingInline: `px-[${val}${suffix}]`,
        paddingBlock: `py-[${val}${suffix}]`,
        margin: `m-[${val}${suffix}]`,
        gap: `gap-[${val}${suffix}]`,
        opacity: `opacity-[${val}]`,
        fontSize: `text-[${val}${suffix}]`,
        fontWeight: `font-[${val}]`,
        letterSpacing: `tracking-[${val}${suffix}]`,
        lineHeight: `leading-[${val}${suffix}]`,
        borderWidth: `border-[${val}${suffix}]`,
      };
      if (mapped[target]) {
        tw.push(mapped[target]);
      } else {
        warnUnmapped(target);
        tw.push(`[${kebab}:${val}${suffix}]`);
      }
      continue;
    }

    if (control.type === "select") {
      warnUnmapped(target);
      tw.push(`[${kebab}:${val}]`);
      continue;
    }

    if (control.type === "toggle") {
      const isOn = val === 1 || val === "1";
      const outVal = isOn
        ? control.onValue || "block"
        : control.offValue || "none";
      warnUnmapped(target);
      tw.push(`[${kebab}:${outVal}]`);
      continue;
    }
  }
  return tw;
}

const warnedProps = new Set<string>();
function warnUnmapped(prop: string) {
  if (warnedProps.has(prop)) return;
  warnedProps.add(prop);
  // eslint-disable-next-line no-console
  console.warn(
    `[Tunable] No Tailwind utility mapping for "${prop}" — falling back to arbitrary-property syntax.`,
  );
}
