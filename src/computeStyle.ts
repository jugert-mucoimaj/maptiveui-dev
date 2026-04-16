import type { TunableControls } from "./types";
import type { CSSProperties } from "react";

/**
 * Converts control definitions + current values into a CSSProperties object.
 * Handles special mappings like "depth" → boxShadow, composite values, etc.
 */
export function computeStyle(
  controls: TunableControls,
  values: Record<string, number | string>
): CSSProperties {
  const style: Record<string, string | number> = {};

  for (const [key, control] of Object.entries(controls)) {
    const val = values[key];
    const target = control.maps || key;

    switch (control.type) {
      case "color": {
        style[target] = val as string;
        break;
      }

      case "range": {
        const num = val as number;
        const unit = control.unit || "px";

        // Special mappings
        if (target === "depth" || target === "boxShadow") {
          // Map a single 0-100 value to a realistic shadow
          const spread = num * 0.3;
          const blur = num * 1.2;
          const y = num * 0.4;
          const opacity = Math.min(0.5, num * 0.008);
          style.boxShadow = num > 0
            ? `0 ${y.toFixed(1)}px ${blur.toFixed(1)}px ${spread.toFixed(1)}px rgba(0,0,0,${opacity.toFixed(3)})`
            : "none";
        } else if (target === "blur" || target === "backdropBlur") {
          style.backdropFilter = `blur(${num}px)`;
          style.WebkitBackdropFilter = `blur(${num}px)`;
        } else if (target === "glow") {
          // Colored glow effect
          const glowColor = (controls[key] as any).glowColor || "rgba(99,102,241,0.5)";
          style.boxShadow = num > 0
            ? `0 0 ${num * 2}px ${num * 0.5}px ${glowColor}`
            : "none";
        } else if (unit === "none" || unit === "") {
          style[target] = num;
        } else {
          style[target] = `${num}${unit}`;
        }
        break;
      }

      case "select": {
        style[target] = val as string;
        break;
      }

      case "toggle": {
        const isOn = val === 1 || val === "1";
        if (isOn) {
          style[target] = control.onValue || "block";
        } else {
          style[target] = control.offValue || "none";
        }
        break;
      }
    }
  }

  return style as CSSProperties;
}

/**
 * Converts computed CSSProperties back to a clean CSS string
 */
export function styleToCSS(style: CSSProperties): string {
  const lines: string[] = [];
  for (const [prop, val] of Object.entries(style)) {
    if (val === undefined || val === null) continue;
    const kebab = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
    // Skip webkit prefixed duplicates
    if (kebab.startsWith("-webkit")) continue;
    lines.push(`  ${kebab}: ${val};`);
  }
  return `{\n${lines.join("\n")}\n}`;
}
