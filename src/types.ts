export type ControlType = "range" | "color" | "select" | "toggle";

export interface RangeControl {
  type: "range";
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: number;
  unit?: string;
  /** Which CSS property this maps to. Defaults to the key name. */
  maps?: string;
}

export interface ColorControl {
  type: "color";
  label?: string;
  default?: string;
  /** Which CSS property this maps to. Defaults to 'background'. */
  maps?: string;
}

export interface SelectControl {
  type: "select";
  label?: string;
  options: string[];
  default?: string;
  maps?: string;
}

export interface ToggleControl {
  type: "toggle";
  label?: string;
  default?: number; // 0 or 1
  /** CSS value when on */
  onValue?: string;
  /** CSS value when off */
  offValue?: string;
  maps?: string;
}

export type TunableControl = RangeControl | ColorControl | SelectControl | ToggleControl;

export type TunableControls = Record<string, TunableControl>;

/** Special composite controls that map one slider to multiple CSS props */
export interface DepthPreset {
  type: "depth";
  label?: string;
  min?: number;
  max?: number;
  default?: number;
  color?: string; // shadow color
}

export interface GlassPreset {
  type: "glass";
  label?: string;
  min?: number;
  max?: number;
  default?: number;
}
