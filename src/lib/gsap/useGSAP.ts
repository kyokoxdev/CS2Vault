"use client";

import { useLayoutEffect, useRef, RefObject, DependencyList } from "react";
import gsap from "gsap";

export function useGSAP(
  callback: (context: gsap.Context) => void,
  deps: DependencyList = [],
  scope?: RefObject<HTMLElement | null>
) {
  const contextRef = useRef<gsap.Context | null>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const ctx = gsap.context(callback, scope?.current || undefined);
    contextRef.current = ctx;

    return () => ctx.revert();
  }, [callback, scope, ...deps]);

  return contextRef;
}
