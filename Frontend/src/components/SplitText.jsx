import React, { useEffect, useState } from 'react';

const SplitText = ({
  text = '',
  className = '',
  delay = 50, // ms per char
  duration = 0.5, // seconds
  ease = 'ease-out',
  splitType = 'chars',
  from = { opacity: 0, y: 20 },
  to = { opacity: 1, y: 0 },
  onLetterAnimationComplete = () => {}
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let finishTimer;
    setMounted(true);

    const letters = splitType === 'words'
      ? text.split(/(\s+)/).filter(Boolean) // keep spaces as tokens
      : Array.from(text);

    const total = letters.length;
    const lastDelay = delay * (total - 1);
    const totalMs = lastDelay + duration * 1000;

    finishTimer = setTimeout(() => {
      onLetterAnimationComplete();
    }, totalMs + 50);

    return () => clearTimeout(finishTimer);
  }, [text, delay, duration, splitType, onLetterAnimationComplete]);

  const letters = splitType === 'words'
    ? text.split(/(\s+)/).filter(Boolean)
    : Array.from(text);

  return (
    <div className={className} aria-hidden={false} style={{ paddingBottom: '0.15em' }}>
      {letters.map((char, i) => {
        if (char === '\n') return <br key={`br-${i}`} />;
        if (char.trim() === '' && splitType === 'chars') return (
          <span key={`sp-${i}`}>&nbsp;</span>
        );

        const delayMs = i * delay;
        const initialStyle = {
          display: 'inline-block',
          lineHeight: 1.2,
          opacity: from.opacity ?? 0,
          transform: `translateY(${from.y ?? 0}px)`,
          willChange: 'transform, opacity'
        };

        const transition = `opacity ${duration}s ${ease} ${delayMs}ms, transform ${duration}s ${ease} ${delayMs}ms`;
        const animatedStyle = mounted ? {
          opacity: to.opacity ?? 1,
          transform: `translateY(${to.y ?? 0}px)`,
          transition
        } : initialStyle;

        return (
          <span
            key={`char-${i}-${char}`}
            style={mounted ? animatedStyle : initialStyle}
          >
            {char}
          </span>
        );
      })}
    </div>
  );
};

export default SplitText;
