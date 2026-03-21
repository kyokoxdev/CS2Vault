"use client";

import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";

export function GSAPSsrTest() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (!rootRef.current || !cardRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 24, rotateY: -12 },
        {
          opacity: 1,
          y: 0,
          rotateY: 0,
          duration: 0.6,
          ease: "power2.out",
        },
      );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        perspective: "1000px",
        padding: "16px",
      }}
    >
      <div
        ref={cardRef}
        style={{
          transformStyle: "preserve-3d",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.04)",
          padding: "16px",
          maxWidth: "320px",
        }}
      >
        GSAP SSR spike component
      </div>
    </div>
  );
}

export default GSAPSsrTest;
