import { useId } from "react";
import "./rewind-marks.css";

/** Two etched neon blades; each stretches from its trailing edge on rewind. */
export default function RewindMark({ className = "", processing = false }: { className?: string; processing?: boolean }) {
  const id = `rewind-energy-${useId().replaceAll(":", "")}`;
  return <span className={`rewind-mark ${processing ? "is-processing" : ""} ${className}`.trim()} aria-hidden="true">
    <svg viewBox="0 0 64 40" focusable="false">
      <defs><linearGradient id={id} x1="0" y1=".5" x2="1" y2=".5">
        <stop stopColor="#e0fbff" /><stop offset=".3" stopColor="#63e6ff" /><stop offset="1" stopColor="#168dff" />
      </linearGradient></defs>
      <g className="rewind-trails" fill="none" stroke="#42dfff" strokeLinecap="round">
        <path className="rewind-trail trail-one" d="M36 12h23" /><path className="rewind-trail trail-two" d="M40 20h22" /><path className="rewind-trail trail-three" d="M36 28h23" />
      </g>
      <g fill="rgba(0,160,255,.1)" stroke={`url(#${id})`} strokeWidth="2.4" strokeLinejoin="round">
        <path className="rewind-blade blade-lead" d="M28 6 7 20l21 14Z" />
        <path className="rewind-blade blade-follow" d="M53 6 32 20l21 14Z" />
      </g>
      <path className="rewind-edge" d="m26 9-16 11 16 11M51 9 35 20l16 11" fill="none" stroke="#d6faff" strokeWidth=".6" strokeOpacity=".8" />
    </svg>
  </span>;
}
