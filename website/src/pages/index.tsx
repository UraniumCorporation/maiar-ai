import React, { useEffect, useRef } from "react";
import type { JSX } from "react";
import GlitchClip from "react-glitch-effect/core/GlitchClip";

import Head from "@docusaurus/Head";
import Link from "@docusaurus/Link";

import { AsciiLogo } from "../components/AsciiLogo";

export default function Home(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isMouseMovingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cols: number, rows: number;
    let cellSize = 14; // size in pixels for each cell
    let fadeAlpha = 0.1; // how much to fade each frame

    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/\\";

    let grid: Array<Array<{ alive: boolean; char: string | null }>>;
    let nextGrid: Array<Array<{ alive: boolean; char: string | null }>>;

    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.floor(canvas.width / cellSize);
      rows = Math.floor(canvas.height / cellSize);
      initGrid();
    }

    function initGrid() {
      grid = [];
      for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
          let inCenter =
            c > cols * 0.4 &&
            c < cols * 0.6 &&
            r > rows * 0.4 &&
            r < rows * 0.6;
          let alive = Math.random() < 0.2 && !inCenter;
          let char = alive ? getRandomChar() : null;
          row.push({ alive, char });
        }
        grid.push(row);
      }
    }

    function getRandomChar() {
      return chars.charAt(Math.floor(Math.random() * chars.length));
    }

    function spawnParticlesAroundMouse() {
      if (!isMouseMovingRef.current) return;

      const mouseCol = Math.floor(mouseRef.current.x / cellSize);
      const mouseRow = Math.floor(mouseRef.current.y / cellSize);
      const radius = 3; // Radius of effect around mouse

      for (let r = -radius; r <= radius; r++) {
        for (let c = -radius; c <= radius; c++) {
          const targetRow = mouseRow + r;
          const targetCol = mouseCol + c;

          if (
            targetRow >= 0 &&
            targetRow < rows &&
            targetCol >= 0 &&
            targetCol < cols
          ) {
            // Higher chance to spawn particles near the cursor
            const distance = Math.sqrt(r * r + c * c);
            const spawnChance = 0.8 * (1 - distance / radius);

            if (Math.random() < spawnChance) {
              grid[targetRow][targetCol] = {
                alive: true,
                char: getRandomChar()
              };
            }
          }
        }
      }

      isMouseMovingRef.current = false;
    }

    function computeNextGrid() {
      nextGrid = [];
      for (let r = 0; r < rows; r++) {
        let row = [];
        for (let c = 0; c < cols; c++) {
          let { alive, char } = grid[r][c];
          let neighbors = aliveNeighbors(r, c);
          let nextAlive = alive;
          let nextChar = char;

          if (alive && (neighbors < 2 || neighbors > 3)) {
            nextAlive = false;
            nextChar = null;
          } else if (!alive && neighbors === 3) {
            nextAlive = true;
            nextChar = getRandomChar();
          } else if (alive && (neighbors === 2 || neighbors === 3)) {
            if (Math.random() < 0.2) {
              nextChar = getRandomChar();
            }
          }

          row.push({ alive: nextAlive, char: nextChar });
        }
        nextGrid.push(row);
      }
    }

    function aliveNeighbors(r: number, c: number) {
      let count = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          let rr = r + dr;
          let cc = c + dc;
          if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) {
            if (grid[rr][cc].alive) count++;
          }
        }
      }
      return count;
    }

    function forceChaos() {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() < 0.001) {
            if (!grid[r][c].alive) {
              grid[r][c].alive = true;
              grid[r][c].char = getRandomChar();
            } else {
              grid[r][c].alive = false;
              grid[r][c].char = null;
            }
          }
        }
      }
    }

    function drawGrid() {
      ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#88ff88";
      ctx.font = `${cellSize - 2}px monospace`;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let { alive, char } = grid[r][c];
          if (alive && char) {
            let x = c * cellSize;
            let y = r * cellSize + (cellSize - 2);
            ctx.fillText(char, x, y);
          }
        }
      }
    }

    function update() {
      spawnParticlesAroundMouse();
      computeNextGrid();
      drawGrid();
      grid = nextGrid;
      forceChaos();
      requestAnimationFrame(update);
    }

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      isMouseMovingRef.current = true;
    }

    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousemove", handleMouseMove);

    resizeCanvas();
    requestAnimationFrame(update);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <>
      <Head>
        <title>maiar</title>
        <style>
          {`
            html, body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
            }
            body {
              position: relative;
              font-family: monospace;
              overflow: hidden;
              background: #000;
              color: #88ff88;
              word-break: break-word;
              overflow-wrap: break-word;
            }
            .homepage {
              padding: 0 !important;
              margin: 0 !important;
              width: 100%;
              height: 100vh;
              background: #000;
            }
            .border-frame {
              pointer-events: none;
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              box-shadow: inset 0 0 16px 4px rgba(136,255,136,0.3);
              z-index: 2;
            }
            .noise {
              pointer-events: none;
              position: fixed;
              top: 0;
              left: 0;
              width: 100vw;
              height: 100vh;
              background: rgba(0, 0, 0, 0.1);
              background-size: cover;
              mix-blend-mode: overlay;
              opacity: 0.15;
              z-index: 3;
            }
            #lifeCanvas {
              display: block;
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              z-index: 1;
              opacity: 0.6;
            }
            .center-container {
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              text-align: center;
              z-index: 5;
            }
            .logo-wrapper {
              backdrop-filter: blur(4px);
              background-color: rgba(0, 0, 0, 0.05);
              padding: 10px;
              border: 2px solid #88ff88;
              box-shadow: none;
            }
            .ascii-text {
              color: #88ff88;
              font-family: monospace;
              font-size: 16px;
              line-height: 18px;
              animation: subtleGlitch 5s infinite;
              text-align: center;
              margin-bottom: 8px;
            }
            @keyframes subtleGlitch {
              0%, 100% { text-shadow: 0 0 2px #88ff88; }
              4% { text-shadow: 2px 0 3px #88ff88; }
              8% { text-shadow: -2px -2px 3px #88ff88; }
              12% { text-shadow: 2px 2px 3px #88ff88; }
              20% { text-shadow: 0 -2px 3px #88ff88; }
              25% { text-shadow: 0 2px 3px #88ff88; }
              42% { text-shadow: 0 0 2px #88ff88; }
            }
            .hud-line {
              position: absolute;
              background-color: rgba(136, 255, 136, 0.3);
              z-index: 4;
            }
            .hud-line.vertical {
              width: 1px;
              height: 100%;
              top: 0;
              background-color: rgba(136, 255, 136, 0.3);
              z-index: 4;
            }
            .hud-line.horizontal {
              height: 1px;
              width: 100%;
              left: 0;
              background-color: rgba(136, 255, 136, 0.3);
              z-index: 4;
            }
            .hud-line.corner {
              height: 20px;
              width: 20px;
              background-color: rgba(136, 255, 136, 0.3);
            }
            .hud-line.corner.tl {
              top: 0;
              left: 0;
              border-left: 1px solid rgba(136, 255, 136, 0.3);
              border-top: 1px solid rgba(136, 255, 136, 0.3);
            }
            .hud-line.corner.tr {
              top: 0;
              right: 0;
              border-right: 1px solid rgba(136, 255, 136, 0.3);
              border-top: 1px solid rgba(136, 255, 136, 0.3);
            }
            .hud-line.corner.bl {
              bottom: 0;
              left: 0;
              border-left: 1px solid rgba(136, 255, 136, 0.3);
              border-bottom: 1px solid rgba(136, 255, 136, 0.3);
            }
            .hud-line.corner.br {
              bottom: 0;
              right: 0;
              border-right: 1px solid rgba(136, 255, 136, 0.3);
              border-bottom: 1px solid rgba(136, 255, 136, 0.3);
            }
            .links {
              margin-top: 10px;
              text-align: center;
              z-index: 6;
              display: flex;
              flex-wrap: wrap;
              justify-content: center;
              gap: 15px;
            }
            .links a {
              color: #88ff88;
              text-decoration: none;
              font-size: 1rem;
              transition: color 0.3s;
              white-space: nowrap;
              padding: 5px;
            }
            .links a:hover {
              color: #c2ff66;
            }
            .grain {
              position: fixed;
              top: -150%;
              left: -50%;
              right: -50%;
              bottom: -150%;
              width: 400%;
              height: 400vh;
              background-image: url('data:image/png;base64,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');
              animation: grain 8s steps(10) infinite;
              pointer-events: none;
              z-index: 4;
              opacity: 0.15;
              mix-blend-mode: overlay;
            }

            .green-shift {
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
              z-index: 3;
              mix-blend-mode: screen;
            }

            .green-shift::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              background: rgba(136, 255, 136, 0.03);
              transform: translate(2px, 0);
            }

            @keyframes grain {
              0%, 100% { transform: translate(0, 0); }
              10% { transform: translate(-5%, -10%); }
              20% { transform: translate(-15%, 5%); }
              30% { transform: translate(7%, -25%); }
              40% { transform: translate(-5%, 25%); }
              50% { transform: translate(-15%, 10%); }
              60% { transform: translate(15%, 0%); }
              70% { transform: translate(0%, 15%); }
              80% { transform: translate(3%, 35%); }
              90% { transform: translate(-10%, 10%); }
            }

            .subheading {
              color: #88ff88;
              font-size: 14px;
              margin: 10px 0 20px 0;
              opacity: 0.8;
              letter-spacing: 1px;
            }
          `}
        </style>
      </Head>
      <div className="border-frame" />
      <canvas ref={canvasRef} id="lifeCanvas" />
      <div className="grain" />
      <div className="green-shift" />
      <div className="noise" />
      <div className="hud-line vertical" style={{ left: "5%" }} />
      <div className="hud-line vertical" style={{ left: "95%" }} />
      <div className="hud-line horizontal" style={{ top: "5%" }} />
      <div className="hud-line horizontal" style={{ top: "95%" }} />
      <div className="hud-line corner tl" />
      <div className="hud-line corner tr" />
      <div className="hud-line corner bl" />
      <div className="hud-line corner br" />
      <div className="center-container">
        <div className="logo-wrapper">
          <div className="subheading">
            ca: G5e2XonmccmdKc98g3eNQe5oBYGw9m8xdMUvVtcZpump
          </div>
          <GlitchClip duration={8000}>
            <AsciiLogo />
          </GlitchClip>
          <div className="subheading">a uranium corporation product</div>
          <div className="links">
            <Link to="/docs/getting-started">docs</Link>
            <Link href="https://x.com/Maiar_AI">x.com</Link>
            <Link href="https://github.com/UraniumCorporation/maiar-ai">
              github
            </Link>
            <Link to="/plugins">plugins</Link>
          </div>
        </div>
      </div>
    </>
  );
}
