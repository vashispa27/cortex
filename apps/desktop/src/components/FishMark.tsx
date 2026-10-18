import { useId } from "react";

export default function FishMark({ className = "" }: { className?: string }) {
  const id = useId().replaceAll(":", "");
  const body = `fish-body-${id}`;
  const tail = `fish-tail-${id}`;

  return (
    <svg className={`fish-mark ${className}`} viewBox="0 0 64 48" role="img" aria-label="Open Memory fish" focusable="false">
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffb06b" />
          <stop offset="0.55" stopColor="#f28a44" />
          <stop offset="1" stopColor="#df6327" />
        </linearGradient>
        <linearGradient id={tail} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f99952" />
          <stop offset="1" stopColor="#d9531e" />
        </linearGradient>
      </defs>
      <path d="M42 23c6-8 13-11 17-9-1 5-4 10-10 13 5 3 8 7 9 12-6 1-12-2-16-8Z" fill={`url(#${tail})`} />
      <path d="M25 15c3-6 8-9 12-8-1 5-4 8-8 10Z" fill="#f6a166" />
      <path d="M16 28c4 6 10 9 16 8-4 4-11 4-16 1Z" fill="#e67534" />
      <ellipse cx="28" cy="25" rx="18" ry="12.5" fill={`url(#${body})`} />
      <path d="M19 17c5-3 11-3 16-1" fill="none" stroke="#ffd0a5" strokeLinecap="round" strokeWidth="2" opacity=".65" />
      <path d="M22 31c4 2 8 2 12 0" fill="none" stroke="#c95720" strokeLinecap="round" strokeWidth="1.6" opacity=".55" />
      <path d="M31 18c2 4 2 9 0 14" fill="none" stroke="#c95720" strokeLinecap="round" strokeWidth="1.5" opacity=".55" />
      <circle cx="16.5" cy="21.5" r="3" fill="#251f1b" />
      <circle cx="15.6" cy="20.5" r="1" fill="#fff8ef" />
      <path d="M8.5 27c1.4 1.2 3.2 1.3 4.7.5" fill="none" stroke="#7e3515" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}
