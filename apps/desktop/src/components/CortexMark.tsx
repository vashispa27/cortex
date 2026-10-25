import { useEffect, useId, useRef } from "react";
import "./cortex-marks.css";

/** Brain silhouette, cerebellum and stem; the glow layer paints behind these. */
export const BRAIN_OUTLINE =
  "M10 46C4 36 8 22 20 15C28 9 40 7 50 9C58 4 72 5 79 13C90 17 95 29 90 40C88 46 82 48 76 48C72 52 64 52 60 49C54 54 44 55 38 51C34 49 30 51 24 51C16 52 12 50 10 46Z";
export const BRAIN_CEREBELLUM = "M62 50C65 59 76 63 84 59C90 55 90 48 87 44M70 55 82 53M68 59 80 58";
export const BRAIN_STEM = "M52 51C54 58 56 64 56 71L64 71C63 64 63 57 62 51";

/** Circuit traces that follow the folds of the cortex; each ends in a node. */
export const BRAIN_TRACES: { d: string; node: [number, number] }[] = [
  { d: "M16 38H26L32 32H44L50 26H62", node: [62, 26] },
  { d: "M18 28 24 22H34L40 16H54", node: [54, 16] },
  { d: "M28 45H40L46 39H58L64 33H80", node: [80, 33] },
  { d: "M58 14 66 22H78L84 28", node: [84, 28] },
  { d: "M30 24V30M44 22V28M68 30V38", node: [68, 38] },
  { d: "M50 44 54 40H66L72 44H80", node: [80, 44] },
  { d: "M22 44 26 40", node: [22, 44] },
];

/**
 * Circuit-board brain. Idle it is a dim blue glow; while `processing` the whole
 * brain lights up and bright signals race along the traces, faster the longer
 * the work runs.
 */
export default function CortexMark({ className = "", processing = false }: { className?: string; processing?: boolean }) {
  const id = `cortex-${useId().replaceAll(":", "")}`;
  const root = useRef<HTMLSpanElement>(null);
  const intensity = useRef(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.reduceMotion === "true";
    const signals = Array.from(el.querySelectorAll<SVGPathElement>(".cortex-signal"));
    const paint = (glow: number, phase: number) => {
      el.style.setProperty("--glow", glow.toFixed(3));
      el.style.setProperty("--sig", Math.min(1, glow * 2.4).toFixed(3));
      signals.forEach((path, index) => {
        const offset = -((phase * (1 + index * 0.07) + index * 0.21) % 1);
        path.style.strokeDashoffset = offset.toFixed(4);
      });
    };
    if (reduced) {
      paint(processing ? 1 : 0, 0.2);
      return;
    }
    let frame = 0;
    let last = performance.now();
    let phase = 0;
    if (processing) intensity.current = Math.max(intensity.current, 0.25);
    const step = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      // Ramp up slowly while working so the signals visibly accelerate; relax quickly afterwards.
      intensity.current += ((processing ? 1 : 0) - intensity.current) * (1 - Math.exp(-dt / (processing ? 1.1 : 0.35)));
      const level = intensity.current;
      phase += dt * (0.25 + 5.5 * level * level);
      paint(level, phase);
      if (processing || level > 0.01) frame = requestAnimationFrame(step);
      else paint(0, 0);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [processing]);

  return <span ref={root} className={`cortex-mark ${processing ? "is-processing" : ""} ${className}`.trim()} aria-hidden="true">
    <svg viewBox="0 0 100 76" focusable="false">
      <defs>
        <radialGradient id={`${id}-halo`} cx=".48" cy=".4" r=".62">
          <stop stopColor="#8fd8ff" stopOpacity=".95" /><stop offset=".5" stopColor="#1f7bff" stopOpacity=".5" /><stop offset="1" stopColor="#0a3d9c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#8fe3ff" /><stop offset=".55" stopColor="#2e92ff" /><stop offset="1" stopColor="#1b5fe0" />
        </linearGradient>
      </defs>
      <ellipse className="cortex-halo" cx="50" cy="32" rx="46" ry="34" fill={`url(#${id}-halo)`} />
      <path className="cortex-body" d={BRAIN_OUTLINE} fill="rgba(10,50,140,.38)" />
      <g className="cortex-shell" fill="none" stroke={`url(#${id}-line)`} strokeLinecap="round" strokeLinejoin="round">
        <path d={BRAIN_OUTLINE} /><path d={BRAIN_CEREBELLUM} /><path d={BRAIN_STEM} />
      </g>
      <g className="cortex-traces" fill="none" stroke={`url(#${id}-line)`} strokeLinecap="round" strokeLinejoin="round">
        {BRAIN_TRACES.map((trace, index) => <path key={index} d={trace.d} />)}
      </g>
      <g className="cortex-signals" fill="none" stroke="#e8fbff" strokeLinecap="round" strokeLinejoin="round">
        {BRAIN_TRACES.map((trace, index) => <path key={index} className="cortex-signal" d={trace.d} pathLength={1} strokeDasharray="0.12 0.88" />)}
      </g>
      <g className="cortex-nodes" fill="#bff0ff">
        {BRAIN_TRACES.map((trace, index) => <circle key={index} className="cortex-node" cx={trace.node[0]} cy={trace.node[1]} r="2.1" style={{ animationDelay: `${index * 0.11}s` }} />)}
      </g>
    </svg>
  </span>;
}
