"use client";

import gsap from "gsap";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function fadeInUp(
  element: gsap.TweenTarget,
  delay: number = 0
): gsap.core.Tween | null {
  if (prefersReducedMotion()) {
    gsap.set(element, { opacity: 1, y: 0 });
    return null;
  }

  return gsap.fromTo(
    element,
    { opacity: 0, y: 24 },
    {
      opacity: 1,
      y: 0,
      duration: 0.6,
      delay,
      ease: "power2.out",
    }
  );
}

export function revealData(
  element: gsap.TweenTarget,
  value: number,
  duration: number = 1
): gsap.core.Tween | null {
  if (prefersReducedMotion()) {
    gsap.set(element, { textContent: String(value) });
    return null;
  }

  const obj = { val: 0 };
  return gsap.to(obj, {
    val: value,
    duration,
    ease: "power2.out",
    onUpdate: () => {
      const target = gsap.utils.toArray(element)[0] as HTMLElement | undefined;
      if (target) {
        target.textContent = Math.round(obj.val).toString();
      }
    },
  });
}

export function parallaxScroll(
  element: gsap.TweenTarget,
  speed: number = 0.5
): gsap.core.Tween | null {
  if (prefersReducedMotion()) {
    return null;
  }

  return gsap.to(element, {
    y: () => window.scrollY * speed,
    ease: "none",
    paused: true,
  });
}

export { prefersReducedMotion };
