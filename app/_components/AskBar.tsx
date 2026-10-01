"use client";

import { useEffect, useState } from "react";

// One example question per MCP tool. Cycles until the visitor picks a pill.
const TOOLS = [
  {
    name: "Balances",
    question: "What's my net worth across every account?",
    caption: "Every account and balance, grouped by bank.",
  },
  {
    name: "Transactions",
    question: "Show everything I paid Amazon this month.",
    caption: "Search and filter transactions, pending ones included.",
  },
  {
    name: "Spending",
    question: "Where did my money go in September?",
    caption: "Totals by payee, account or month.",
  },
  {
    name: "Investments",
    question: "How are my investments doing?",
    caption: "Positions, market value and gains.",
  },
  {
    name: "Bank links",
    question: "Do any of my banks need me to sign in again?",
    caption: "Shows bank connections that need attention.",
  },
];

const CYCLE_MS = 4200;
const FADE_MS = 400;

export function AskBar() {
  const [index, setIndex] = useState(0);
  const [fading, setFading] = useState(false);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let fadeTimer: ReturnType<typeof setTimeout>;
    const timer = setInterval(() => {
      setFading(true);
      fadeTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % TOOLS.length);
        setFading(false);
      }, FADE_MS);
    }, CYCLE_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(fadeTimer);
    };
  }, [auto]);

  const tool = TOOLS[index];
  if (!tool) return null;

  return (
    <div className="ask">
      <div className="ask-bar" aria-live="polite">
        <span className="ask-question" data-fading={fading}>
          {tool.question}
        </span>
        <span className="ask-send" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 19V5M5 12l7-7 7 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
      <p className="ask-caption">{tool.caption}</p>
      <div className="pills" role="group" aria-label="What you can ask about">
        {TOOLS.map((t, i) => (
          <button
            key={t.name}
            type="button"
            className="pill"
            aria-pressed={i === index}
            onClick={() => {
              setAuto(false);
              setFading(false);
              setIndex(i);
            }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}
