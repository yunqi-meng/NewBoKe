"use client";
import { useEffect, useRef } from 'react';

interface Ripple {
  x: number;
  y: number;
  r: number;
  opacity: number;
  velocity: number;
}

function createRipple(x: number, y: number): Ripple {
  return { x, y, r: 0, opacity: 0.6, velocity: 2.5 };
}

function updateRipple(ripple: Ripple) {
  ripple.r += ripple.velocity;
  ripple.velocity *= 0.96;
  ripple.opacity -= 0.015;
}

function drawRipple(ctx: CanvasRenderingContext2D, ripple: Ripple) {
  ctx.beginPath();
  ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(129, 140, 248, ${ripple.opacity})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ripple.x, ripple.y, ripple.r * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(129, 140, 248, ${ripple.opacity * 0.3})`;
  ctx.fill();
}

export default function ClickEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ripples: Ripple[] = [];
    let rafId = 0;
    let running = false;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    // 只有还有涟漪时才继续 rAF；空闲时停掉循环
    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'rgba(129, 140, 248, 0.5)';

      for (let i = 0; i < ripples.length; i++) {
        updateRipple(ripples[i]);
        drawRipple(ctx, ripples[i]);
        if (ripples[i].opacity <= 0) {
          ripples.splice(i, 1);
          i--;
        }
      }

      if (ripples.length > 0) {
        rafId = requestAnimationFrame(animate);
      } else {
        running = false;
        rafId = 0;
      }
    };

    const handleClick = (e: MouseEvent) => {
      ripples.push(createRipple(e.clientX, e.clientY));
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(animate);
      }
    };

    window.addEventListener('click', handleClick);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('click', handleClick);
      if (rafId) cancelAnimationFrame(rafId);
      ripples.length = 0;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[9999]"
    />
  );
}
