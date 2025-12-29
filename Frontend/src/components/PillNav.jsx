import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

const PillNav = ({
  items,
  activeValue,
  onSelect,
  className = '',
  ease = 'power3.easeOut',
  baseColor = '#000',
  pillColor = '#9c5a1f',
  hoverPillColor = 'orange',
  hoveredPillTextColor = '#fff',
  pillTextColor = '#fff',
  pillBorderColor = 'rgba(0, 0, 0, 0.15)',
  groupBorderColor = 'rgba(0, 0, 0, 0.15)',
  initialLoadAnimation = true
}) => {
  const circleRefs = useRef([]);
  const tlRefs = useRef([]);
  const activeTweenRefs = useRef([]);
  const navItemsRef = useRef(null);
  const didInitialAnimRef = useRef(false);

  useEffect(() => {
    const layout = () => {
      circleRefs.current.forEach((circle) => {
        if (!circle?.parentElement) return;

        const pill = circle.parentElement;
        const rect = pill.getBoundingClientRect();
        const { width: w, height: h } = rect;
        const R = ((w * w) / 4 + h * h) / (2 * h);
        const D = Math.ceil(2 * R) + 2;
        const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
        const originY = D - delta;

        circle.style.width = `${D}px`;
        circle.style.height = `${D}px`;
        circle.style.bottom = `-${delta}px`;

        gsap.set(circle, {
          xPercent: -50,
          scale: 0,
          transformOrigin: `50% ${originY}px`
        });

        const label = pill.querySelector('.pill-label');
        const white = pill.querySelector('.pill-label-hover');

        if (label) gsap.set(label, { y: 0 });
        if (white) gsap.set(white, { y: h + 12, opacity: 0 });

        const index = circleRefs.current.indexOf(circle);
        if (index === -1) return;

        tlRefs.current[index]?.kill();
        const tl = gsap.timeline({ paused: true });

        tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease, overwrite: 'auto' }, 0);

        if (label) {
          tl.to(label, { y: -(h + 8), duration: 2, ease, overwrite: 'auto' }, 0);
        }

        if (white) {
          gsap.set(white, { y: Math.ceil(h + 100), opacity: 0 });
          tl.to(white, { y: 0, opacity: 1, duration: 2, ease, overwrite: 'auto' }, 0);
        }

        tlRefs.current[index] = tl;
      });
    };

    layout();
    window.addEventListener('resize', layout);

    if (initialLoadAnimation && !didInitialAnimRef.current) {
      const navItems = navItemsRef.current;
      if (navItems) {
        gsap.set(navItems, { width: 0, overflow: 'hidden' });
        gsap.to(navItems, { width: 'auto', duration: 0.6, ease });
      }
      didInitialAnimRef.current = true;
    }

    return () => window.removeEventListener('resize', layout);
  }, [items?.length, ease, initialLoadAnimation]);

  const handleEnter = (i) => {
    const tl = tlRefs.current[i];
    if (!tl) return;
    activeTweenRefs.current[i]?.kill();
    activeTweenRefs.current[i] = tl.tweenTo(tl.duration(), { duration: 0.3, ease, overwrite: 'auto' });
  };

  const handleLeave = (i) => {
    const tl = tlRefs.current[i];
    if (!tl) return;
    const item = items?.[i];
    if (item && item.value === activeValue) {
      tl.progress(1);
      return;
    }
    activeTweenRefs.current[i]?.kill();
    activeTweenRefs.current[i] = tl.tweenTo(0, { duration: 0.2, ease, overwrite: 'auto' });
  };

  useEffect(() => {
    if (!items?.length) return;

    items.forEach((item, i) => {
      const tl = tlRefs.current[i];
      if (!tl) return;

      activeTweenRefs.current[i]?.kill();

      if (item.value === activeValue) {
        tl.progress(1);
      } else {
        tl.progress(0);
      }
    });
  }, [activeValue, items]);

  if (!items || items.length === 0) return null;

  return (
    <div
      ref={navItemsRef}
      className={`relative items-center rounded-full hidden md:flex ${className}`}
      style={{
        height: '42px',
        background: baseColor,
        border: `1px solid ${groupBorderColor}`,
        padding: '2px'
      }}
    >
      <ul role="menubar" className="list-none flex items-stretch m-0 p-[3px] h-full gap-2">
        {items.map((item, i) => {
          const isActive = activeValue === item.value;
          const Icon = item.icon;

          return (
            <li key={item.value} role="none" className="flex h-full">
              <button
                type="button"
                role="menuitem"
                className="relative overflow-hidden inline-flex items-center justify-center h-full no-underline rounded-full box-border font-semibold text-[12px] uppercase cursor-pointer px-4"
                style={{
                  background: pillColor,
                  color: pillTextColor,
                  border: `1px solid ${pillBorderColor}`
                }}
                aria-label={item.ariaLabel || item.label}
                onMouseEnter={() => handleEnter(i)}
                onMouseLeave={() => handleLeave(i)}
                onFocus={() => handleEnter(i)}
                onBlur={() => handleLeave(i)}
                onClick={() => onSelect?.(item.value)}
              >
                <span
                  className="hover-circle absolute left-1/2 bottom-0 rounded-full z-[1] block pointer-events-none"
                  style={{
                    background: hoverPillColor,
                    willChange: 'transform'
                  }}
                  aria-hidden="true"
                  ref={(el) => {
                    circleRefs.current[i] = el;
                  }}
                />

                <span className="label-stack relative inline-block leading-[1] z-[2]">
                  <span className="pill-label relative z-[2] inline-flex items-center gap-2">
                    {Icon ? <Icon className="w-4 h-4" /> : null}
                    {item.label}
                  </span>
                  <span
                    className="pill-label-hover absolute left-0 top-0 z-[3] inline-flex items-center gap-2"
                    style={{ color: hoveredPillTextColor }}
                    aria-hidden="true"
                  >
                    {Icon ? <Icon className="w-4 h-4" /> : null}
                    {item.label}
                  </span>
                </span>

                {isActive && (
                  <span
                    className="absolute left-1/2 -bottom-[6px] -translate-x-1/2 w-3 h-3 rounded-full z-[4]"
                    style={{ background: baseColor }}
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PillNav;
