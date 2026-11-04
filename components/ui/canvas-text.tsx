"use client";

import React, { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface CanvasTextProps {
  text: string;
  className?: string;
  backgroundClassName?: string;
  colors?: string[];
  animationDuration?: number;
  lineWidth?: number;
  lineGap?: number;
  curveIntensity?: number;
}

export function CanvasText({
  text,
  className = "",
  backgroundClassName = "",
  colors = [
    "rgba(0, 153, 255, 1)",
    "rgba(0, 153, 255, 0.9)",
    "rgba(0, 153, 255, 0.8)",
    "rgba(0, 153, 255, 0.7)",
    "rgba(0, 153, 255, 0.6)",
    "rgba(0, 153, 255, 0.5)",
    "rgba(0, 153, 255, 0.4)",
    "rgba(0, 153, 255, 0.3)",
    "rgba(0, 153, 255, 0.2)",
    "rgba(0, 153, 255, 0.1)",
  ],
  animationDuration = 20,
  lineWidth = 1.5,
  lineGap = 4,
  curveIntensity = 25,
}: CanvasTextProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textEl = textRef.current;
    if (!canvas || !textEl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let startTime = performance.now();
    let width = 0;
    let height = 0;
    let dpr = window.devicePixelRatio || 1;

    const updateDimensions = () => {
      const rect = textEl.getBoundingClientRect();
      width = Math.max(rect.width, 10);
      height = Math.max(rect.height, 10);
      dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions();
    });
    resizeObserver.observe(textEl);

    const render = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;
      const phase = (elapsed / Math.max(animationDuration, 1)) * Math.PI * 4;

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);

      // Step 1: Draw animated curved wavy lines
      ctx.globalCompositeOperation = "source-over";
      let colorIndex = 0;

      for (let y = -curveIntensity; y <= height + curveIntensity; y += lineGap) {
        const color = colors[colorIndex % colors.length];
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();

        const step = 8;
        for (let x = 0; x <= width + step; x += step) {
          const wave =
            Math.sin(x * 0.04 + phase + colorIndex * 0.25) * (curveIntensity * 0.25);
          const py = y + wave;

          if (x === 0) {
            ctx.moveTo(x, py);
          } else {
            ctx.lineTo(x, py);
          }
        }
        ctx.stroke();
        colorIndex++;
      }

      // Step 2: Clip using the actual text
      ctx.globalCompositeOperation = "destination-in";

      const computed = window.getComputedStyle(textEl);
      const fontSize = computed.fontSize || "24px";
      const fontWeight = computed.fontWeight || "700";
      const fontFamily = computed.fontFamily || "sans-serif";
      const letterSpacing = computed.letterSpacing || "normal";

      ctx.font = `${fontWeight} ${fontSize} ${fontFamily}`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

      if ("letterSpacing" in ctx && letterSpacing !== "normal") {
        (ctx as any).letterSpacing = letterSpacing;
      }

      ctx.fillText(text, 0, height / 2);
      ctx.restore();

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      resizeObserver.disconnect();
    };
  }, [text, colors, animationDuration, lineWidth, lineGap, curveIntensity]);

  return (
    <span
      ref={containerRef}
      className={cn("relative inline-block align-baseline font-bold select-none", className)}
    >
      {/* Background layer if provided */}
      {backgroundClassName && (
        <span
          className={cn(
            "absolute -inset-1 rounded-sm opacity-20 -z-10 blur-xs",
            backgroundClassName
          )}
          aria-hidden="true"
        />
      )}

      {/* Hidden text measuring node that preserves perfect flow and font styling */}
      <span ref={textRef} className="opacity-0 pointer-events-none select-none inline-block">
        {text}
      </span>

      {/* Canvas rendering clipped animated lines */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />

      {/* Screen-reader accessible label */}
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function CanvasTextDemo() {
  return (
    <div className="flex min-h-80 items-center justify-center p-8">
      <h2
        className={cn(
          "group relative mx-auto mt-4 max-w-2xl text-left text-4xl leading-20 font-bold tracking-tight text-balance text-neutral-600 sm:text-5xl md:text-6xl xl:text-7xl dark:text-neutral-700"
        )}
      >
        Ship landing pages at{" "}
        <CanvasText
          text="Lightning Speed"
          backgroundClassName="bg-blue-600 dark:bg-blue-700"
          colors={[
            "rgba(0, 153, 255, 1)",
            "rgba(0, 153, 255, 0.9)",
            "rgba(0, 153, 255, 0.8)",
            "rgba(0, 153, 255, 0.7)",
            "rgba(0, 153, 255, 0.6)",
            "rgba(0, 153, 255, 0.5)",
            "rgba(0, 153, 255, 0.4)",
            "rgba(0, 153, 255, 0.3)",
            "rgba(0, 153, 255, 0.2)",
            "rgba(0, 153, 255, 0.1)",
          ]}
          lineGap={4}
          animationDuration={20}
        />
      </h2>
    </div>
  );
}
