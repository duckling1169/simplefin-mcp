import * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Bold "Blocks" shaped panel — the signature surface of the design language.
 *
 * Three layers (see globals.css): the outer `.panel` carries the hard offset
 * shadow, `.pink` is the ink outline, `.pf` is the clipped paper fill. One safe
 * corner is chamfered / slanted / notched / rounded; the rest stay square.
 *
 * Put your content inside — it renders within the paper fill. Use `fillClassName`
 * to set the fill's padding / background (e.g. an orange hero), and `cut`/`slant`/
 * `sdy` to size the shaped corner.
 */
export type PanelShape = "chamfer-tr" | "slant-br" | "notch-bl" | "round-tr" | "flat";

const SHAPE_CLASS: Record<PanelShape, string> = {
  "chamfer-tr": "k-tr",
  "slant-br": "k-br",
  "notch-bl": "k-bl",
  "round-tr": "k-rr",
  flat: "",
};

type PanelCssVars = React.CSSProperties & {
  "--cut"?: string;
  "--slant"?: string;
  "--sdy"?: string;
};

export interface PanelProps extends React.ComponentProps<"div"> {
  /** Which corner is shaped, and how. Defaults to a top-right chamfer. */
  shape?: PanelShape;
  /** Size of the chamfer/notch/round corner (CSS length). */
  cut?: string;
  /** Horizontal reach of the bottom-right slant. */
  slant?: string;
  /** Vertical drop of the bottom-right slant. */
  sdy?: string;
  /** Classes applied to the inner paper fill (padding, background, layout). */
  fillClassName?: string;
}

function Panel({
  shape = "chamfer-tr",
  cut,
  slant,
  sdy,
  className,
  fillClassName,
  style,
  children,
  ...props
}: PanelProps) {
  const vars: PanelCssVars = { ...style };
  if (cut) vars["--cut"] = cut;
  if (slant) vars["--slant"] = slant;
  if (sdy) vars["--sdy"] = sdy;

  return (
    <div data-slot="panel" className={cn("panel", className)} style={vars} {...props}>
      <div className={cn("pink", SHAPE_CLASS[shape])}>
        <div className={cn("pf", fillClassName)}>{children}</div>
      </div>
    </div>
  );
}

/**
 * Mono uppercase caption that labels nearly everything in the bold language
 * (stat tiles, panel headers, section dividers). `tone` tints it (e.g. orange
 * for the active accent); default is the muted ink.
 */
function Kicker({
  className,
  tone,
  style,
  ...props
}: React.ComponentProps<"div"> & { tone?: "orange" | "ink-3" }) {
  const color =
    tone === "orange" ? "var(--orange)" : tone === "ink-3" ? "var(--ink-3)" : undefined;
  return (
    <div
      data-slot="kicker"
      className={cn("kick", className)}
      style={color ? { color, ...style } : style}
      {...props}
    />
  );
}

export { Panel, Kicker };
