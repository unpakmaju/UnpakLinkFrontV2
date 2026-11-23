import React, { useState, useEffect, useRef, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X, Upload, Download, RotateCcw, Check } from "lucide-react";
import logoUnpakSimple from "@/assets/logo-unpak-simple.webp";
import logoUnpakOnly from "@/assets/logo-unpak.webp";

const STORAGE_KEY_PREFIX = "unpaklink_qr_design_";

export const DEFAULT_QR_DESIGN = {
  template: "pill-top-center",
  color: "#49318f",
  bodyShape: "rounded", // square | dots | rounded | classy
  cornerStyle: "rounded", // square | rounded | circle
  logoType: "unpak-only", // unpak-only | unpak-simple | unpak-badge | none | custom
  customLogoDataUrl: "",
  logoShape: "rounded", // rounded | circle | square
  logoPosition: "center", // center | bottom-right | bottom-center | middle-right
  frameStyle: "top-pill", // none | bottom-bar | top-bar | top-pill | bottom-pill | top-header | bottom-footer
  frameText: "",
};

export function getSavedQrDesign(shortUrl) {
  if (!shortUrl) return DEFAULT_QR_DESIGN;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${shortUrl}`);
    if (!raw) return DEFAULT_QR_DESIGN;
    return { ...DEFAULT_QR_DESIGN, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_QR_DESIGN;
  }
}

export function saveQrDesign(shortUrl, design) {
  if (!shortUrl) return;
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${shortUrl}`,
      JSON.stringify(design),
    );
  } catch (err) {
    console.error("Failed to save QR design:", err);
  }
}

// Helper: Draw rounded rectangle path on Canvas 2D context
function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const radius =
    typeof r === "number"
      ? { tl: r, tr: r, br: r, bl: r }
      : { tl: 0, tr: 0, br: 0, bl: 0, ...r };
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + w - radius.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius.tr);
  ctx.lineTo(x + w, y + h - radius.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius.br, y + h);
  ctx.lineTo(x + radius.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
}

// Check if (row, col) is inside one of the three 7x7 Finder Patterns (+ 1 cell separator)
function isFinderPatternZone(row, col, count) {
  // Top-left (0..7, 0..7)
  if (row <= 7 && col <= 7) return true;
  // Top-right (0..7, count-8..count-1)
  if (row <= 7 && col >= count - 8) return true;
  // Bottom-left (count-8..count-1, 0..7)
  if (row >= count - 8 && col <= 7) return true;
  return false;
}

// Automatically trim transparent whitespace around any logo image so it renders full-size
function trimTransparentImage(img) {
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return img;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    let top = h,
      left = w,
      right = 0,
      bottom = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alpha = data[(y * w + x) * 4 + 3];
        if (alpha > 15) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }

    if (right < left || bottom < top) return img;

    const cropW = right - left + 1;
    const cropH = bottom - top + 1;
    const trimmed = document.createElement("canvas");
    trimmed.width = cropW;
    trimmed.height = cropH;
    trimmed
      .getContext("2d")
      .drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);
    trimmed.naturalWidth = cropW;
    trimmed.naturalHeight = cropH;
    return trimmed;
  } catch {
    return img;
  }
}

// Calculate logo bounding box in module coordinates so we can excavate modules underneath
function getLogoModuleBox(count, design, imgAspect = 1) {
  if (!design || design.logoType === "none") return null;
  if (design.logoType === "custom" && !design.customLogoDataUrl) return null;

  const isWide =
    design.logoType === "unpak-simple" ||
    design.logoType === "unpak-badge" ||
    (design.logoType === "custom" && imgAspect > 1.35);

  // Prominent logo size utilizing Reed-Solomon Level H (30%) error correction
  const boxW = isWide
    ? Math.max(11, Math.round(count * 0.40))
    : Math.max(8, Math.round(count * 0.30));
  const boxH = isWide
    ? Math.max(5, Math.round(count * 0.19))
    : Math.max(8, Math.round(count * 0.30));

  let startCol = Math.floor((count - boxW) / 2);
  let startRow = Math.floor((count - boxH) / 2);

  switch (design.logoPosition) {
    case "bottom-right":
      startCol = count - boxW - 1;
      startRow = count - boxH - 1;
      break;
    case "bottom-center":
      startCol = Math.floor((count - boxW) / 2);
      startRow = count - boxH - 1;
      break;
    case "middle-right":
      startCol = count - boxW - 1;
      startRow = Math.floor((count - boxH) / 2);
      break;
    case "center":
    default:
      startCol = Math.floor((count - boxW) / 2);
      startRow = Math.floor((count - boxH) / 2);
      break;
  }

  return {
    col: startCol,
    row: startRow,
    w: boxW,
    h: boxH,
  };
}

// Draw a custom 7x7 Finder Eye at (startCol, startRow)
function drawCustomFinderEye(ctx, startX, startY, cellSize, cornerStyle, color) {
  const outerSize = cellSize * 7;
  const innerOffset = cellSize * 1;
  const innerSize = cellSize * 5;
  const ballOffset = cellSize * 2;
  const ballSize = cellSize * 3;

  ctx.save();
  ctx.fillStyle = color;

  if (cornerStyle === "circle") {
    // Outer ring circle
    const cx = startX + outerSize / 2;
    const cy = startY + outerSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, outerSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, innerSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, ballSize / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (cornerStyle === "rounded") {
    drawRoundedRectPath(
      ctx,
      startX,
      startY,
      outerSize,
      outerSize,
      cellSize * 2,
    );
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    drawRoundedRectPath(
      ctx,
      startX + innerOffset,
      startY + innerOffset,
      innerSize,
      innerSize,
      cellSize * 1.35,
    );
    ctx.fill();

    ctx.fillStyle = color;
    drawRoundedRectPath(
      ctx,
      startX + ballOffset,
      startY + ballOffset,
      ballSize,
      ballSize,
      cellSize * 0.85,
    );
    ctx.fill();
  } else {
    // Square
    ctx.fillRect(startX, startY, outerSize, outerSize);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(
      startX + innerOffset,
      startY + innerOffset,
      innerSize,
      innerSize,
    );
    ctx.fillStyle = color;
    ctx.fillRect(startX + ballOffset, startY + ballOffset, ballSize, ballSize);
  }

  ctx.restore();
}

// Draw a single QR data module based on selected bodyShape
function drawDataModule(ctx, x, y, size, bodyShape) {
  if (bodyShape === "dots") {
    const r = (size * 0.86) / 2;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (bodyShape === "rounded") {
    const pad = size * 0.06;
    const s = size - pad * 2;
    drawRoundedRectPath(ctx, x + pad, y + pad, s, s, s * 0.34);
    ctx.fill();
  } else if (bodyShape === "classy") {
    const pad = size * 0.05;
    const s = size - pad * 2;
    drawRoundedRectPath(ctx, x + pad, y + pad, s, s, {
      tl: s * 0.48,
      tr: 0,
      br: s * 0.48,
      bl: 0,
    });
    ctx.fill();
  } else {
    // classic square (+0.35px overlap to avoid subpixel gaps)
    ctx.fillRect(x, y, size + 0.35, size + 0.35);
  }
}

/**
 * CustomQrRenderer: Renders customized QR code + Frame + Logo onto an HTML5 Canvas
 */
export const CustomQrRenderer = React.forwardRef(function CustomQrRenderer(
  {
    value,
    shortUrl = "",
    design = DEFAULT_QR_DESIGN,
    size = 280,
    className = "",
  },
  forwardedCanvasRef,
) {
  const hiddenSvgWrapRef = useRef(null);
  const internalCanvasRef = useRef(null);
  const [matrix, setMatrix] = useState([]);
  const [loadedLogo, setLoadedLogo] = useState(null);

  const setCanvasRef = (node) => {
    internalCanvasRef.current = node;
    if (typeof forwardedCanvasRef === "function") {
      forwardedCanvasRef(node);
    } else if (forwardedCanvasRef) {
      forwardedCanvasRef.current = node;
    }
  };

  // 1. Parse exact 2D boolean matrix from hidden QRCodeSVG
  useEffect(() => {
    if (!hiddenSvgWrapRef.current) return;
    const svgEl = hiddenSvgWrapRef.current.querySelector("svg");
    if (!svgEl) return;

    const viewBox = svgEl.getAttribute("viewBox");
    if (!viewBox) return;
    const count = parseInt(viewBox.split(" ")[2], 10);
    if (!count || isNaN(count)) return;

    const paths = svgEl.querySelectorAll("path");
    const fgPath = paths[1];
    if (!fgPath) return;

    const d = fgPath.getAttribute("d") || "";
    const grid = Array.from({ length: count }, () => Array(count).fill(false));

    const regex = /M(\d+)[,\s]+(\d+)\s*h(\d+)v1/g;
    let match;
    while ((match = regex.exec(d)) !== null) {
      const startX = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      const len = parseInt(match[3], 10);
      for (let x = startX; x < startX + len; x++) {
        if (y >= 0 && y < count && x >= 0 && x < count) {
          grid[y][x] = true;
        }
      }
    }
    setMatrix(grid);
  }, [value]);

  // 2. Load active logo image into memory
  const activeLogoSrc = useMemo(() => {
    if (design.logoType === "unpak-simple") return logoUnpakSimple;
    if (design.logoType === "unpak-only" || design.logoType === "unpak-badge")
      return logoUnpakOnly;
    if (design.logoType === "custom" && design.customLogoDataUrl)
      return design.customLogoDataUrl;
    return null;
  }, [design.logoType, design.customLogoDataUrl]);

  useEffect(() => {
    if (!activeLogoSrc) {
      setLoadedLogo(null);
      return;
    }
    let active = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (active) setLoadedLogo(trimTransparentImage(img));
    };
    img.onerror = () => {
      if (active) setLoadedLogo(null);
    };
    img.src = activeLogoSrc;
    return () => {
      active = false;
    };
  }, [activeLogoSrc]);

  // 3. Paint Canvas (Frame + QR Modules + Custom Corners + Excavated Logo)
  useEffect(() => {
    const canvas = internalCanvasRef.current;
    if (!canvas || matrix.length === 0) return;

    const count = matrix.length;
    const dpr = Math.min(window.devicePixelRatio || 2, 3);
    const frameStyle = design.frameStyle || "none";
    const hasFrame = frameStyle !== "none";
    const labelText =
      (design.frameText && design.frameText.trim()) ||
      (shortUrl ? `unpak.link/${shortUrl}` : "unpak.link");

    // Calculate aspect proportions
    const baseW = size;
    const extraH = hasFrame ? Math.round(size * 0.16) : 0;
    const baseH = size + extraH;

    canvas.width = baseW * dpr;
    canvas.height = baseH * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = "#ffffff";
    drawRoundedRectPath(ctx, 0, 0, baseW, baseH, size * 0.06);
    ctx.fill();

    const fgColor = design.color || "#49318f";
    const borderW = Math.max(2.5, size * 0.016);
    const frameRadius = size * 0.065;

    // Determine QR square box area inside the canvas
    let qrBoxX = 0;
    let qrBoxY = 0;
    let qrBoxSize = size;

    if (hasFrame) {
      const padOuter = size * 0.04;
      const pillH = Math.round(size * 0.115);

      if (frameStyle === "top-pill") {
        const frameTop = padOuter + pillH * 0.48;
        const frameH = baseH - frameTop - padOuter;
        const frameW = baseW - padOuter * 2;

        ctx.strokeStyle = fgColor;
        ctx.lineWidth = borderW;
        drawRoundedRectPath(
          ctx,
          padOuter,
          frameTop,
          frameW,
          frameH,
          frameRadius,
        );
        ctx.stroke();

        // Top floating pill
        const pillW = Math.min(
          frameW * 0.84,
          Math.max(frameW * 0.56, labelText.length * (size * 0.026)),
        );
        const pillX = (baseW - pillW) / 2;
        const pillY = padOuter;
        ctx.fillStyle = fgColor;
        drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.round(size * 0.045)}px Montserrat, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          labelText,
          baseW / 2,
          pillY + pillH / 2 + 0.5,
          pillW - 14,
        );

        qrBoxSize = Math.min(frameW, frameH - pillH * 0.55) * 0.88;
        qrBoxX = (baseW - qrBoxSize) / 2;
        qrBoxY = frameTop + pillH * 0.52 + (frameH - pillH * 0.52 - qrBoxSize) / 2;
      } else if (frameStyle === "bottom-pill") {
        const frameTop = padOuter;
        const frameH = baseH - padOuter * 2 - pillH * 0.48;
        const frameW = baseW - padOuter * 2;

        ctx.strokeStyle = fgColor;
        ctx.lineWidth = borderW;
        drawRoundedRectPath(
          ctx,
          padOuter,
          frameTop,
          frameW,
          frameH,
          frameRadius,
        );
        ctx.stroke();

        const pillW = Math.min(
          frameW * 0.84,
          Math.max(frameW * 0.56, labelText.length * (size * 0.026)),
        );
        const pillX = (baseW - pillW) / 2;
        const pillY = frameTop + frameH - pillH * 0.52;
        ctx.fillStyle = fgColor;
        drawRoundedRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.round(size * 0.045)}px Montserrat, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          labelText,
          baseW / 2,
          pillY + pillH / 2 + 0.5,
          pillW - 14,
        );

        qrBoxSize = Math.min(frameW, frameH - pillH * 0.55) * 0.88;
        qrBoxX = (baseW - qrBoxSize) / 2;
        qrBoxY = frameTop + (frameH - pillH * 0.52 - qrBoxSize) / 2;
      } else if (frameStyle === "bottom-bar" || frameStyle === "bottom-footer") {
        const frameX = padOuter;
        const frameY = padOuter;
        const frameW = baseW - padOuter * 2;
        const frameH = baseH - padOuter * 2;
        const barH = Math.round(size * 0.13);

        ctx.strokeStyle = fgColor;
        ctx.lineWidth = borderW;
        drawRoundedRectPath(ctx, frameX, frameY, frameW, frameH, frameRadius);
        ctx.stroke();

        // Bottom bar
        ctx.fillStyle = fgColor;
        if (frameStyle === "bottom-bar") {
          drawRoundedRectPath(
            ctx,
            frameX,
            frameY + frameH - barH,
            frameW,
            barH,
            { tl: 0, tr: 0, br: frameRadius, bl: frameRadius },
          );
          ctx.fill();
        } else {
          const inset = size * 0.035;
          drawRoundedRectPath(
            ctx,
            frameX + inset,
            frameY + frameH - barH - inset * 0.6,
            frameW - inset * 2,
            barH * 0.88,
            size * 0.03,
          );
          ctx.fill();
        }

        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.round(size * 0.045)}px Montserrat, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const textY =
          frameStyle === "bottom-bar"
            ? frameY + frameH - barH / 2
            : frameY + frameH - barH * 0.56 - size * 0.01;
        ctx.fillText(labelText, baseW / 2, textY, frameW - 20);

        const availH = frameH - barH - (frameStyle === "bottom-footer" ? size * 0.03 : 0);
        qrBoxSize = Math.min(frameW, availH) * 0.86;
        qrBoxX = (baseW - qrBoxSize) / 2;
        qrBoxY = frameY + (availH - qrBoxSize) / 2;
      } else if (frameStyle === "top-bar" || frameStyle === "top-header") {
        const frameX = padOuter;
        const frameY = padOuter;
        const frameW = baseW - padOuter * 2;
        const frameH = baseH - padOuter * 2;
        const barH = Math.round(size * 0.13);

        ctx.strokeStyle = fgColor;
        ctx.lineWidth = borderW;
        drawRoundedRectPath(ctx, frameX, frameY, frameW, frameH, frameRadius);
        ctx.stroke();

        ctx.fillStyle = fgColor;
        if (frameStyle === "top-bar") {
          drawRoundedRectPath(ctx, frameX, frameY, frameW, barH, {
            tl: frameRadius,
            tr: frameRadius,
            br: 0,
            bl: 0,
          });
          ctx.fill();
        } else {
          const inset = size * 0.035;
          drawRoundedRectPath(
            ctx,
            frameX + inset,
            frameY + inset * 0.6,
            frameW - inset * 2,
            barH * 0.88,
            size * 0.03,
          );
          ctx.fill();
        }

        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.round(size * 0.045)}px Montserrat, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const textY =
          frameStyle === "top-bar"
            ? frameY + barH / 2
            : frameY + barH * 0.44 + size * 0.02;
        ctx.fillText(labelText, baseW / 2, textY, frameW - 20);

        const availH = frameH - barH;
        qrBoxSize = Math.min(frameW, availH) * 0.86;
        qrBoxX = (baseW - qrBoxSize) / 2;
        qrBoxY = frameY + barH + (availH - qrBoxSize) / 2;
      }
    } else {
      const quietPad = size * 0.07;
      qrBoxSize = size - quietPad * 2;
      qrBoxX = quietPad;
      qrBoxY = quietPad;
    }

    const cellSize = qrBoxSize / count;
    const imgAspect =
      loadedLogo && loadedLogo.naturalHeight > 0
        ? loadedLogo.naturalWidth / loadedLogo.naturalHeight
        : 1;
    const logoBox = getLogoModuleBox(count, design, imgAspect);

    // Draw QR Data Modules (skipping 3 Finder Patterns & excavated Logo zone)
    ctx.fillStyle = fgColor;
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (!matrix[r][c]) continue;
        if (isFinderPatternZone(r, c, count)) continue;

        if (
          logoBox &&
          c >= logoBox.col &&
          c < logoBox.col + logoBox.w &&
          r >= logoBox.row &&
          r < logoBox.row + logoBox.h
        ) {
          continue;
        }

        const mx = qrBoxX + c * cellSize;
        const my = qrBoxY + r * cellSize;
        drawDataModule(ctx, mx, my, cellSize, design.bodyShape);
      }
    }

    // Draw 3 Custom Finder Eyes
    drawCustomFinderEye(
      ctx,
      qrBoxX,
      qrBoxY,
      cellSize,
      design.cornerStyle,
      fgColor,
    );
    drawCustomFinderEye(
      ctx,
      qrBoxX + (count - 7) * cellSize,
      qrBoxY,
      cellSize,
      design.cornerStyle,
      fgColor,
    );
    drawCustomFinderEye(
      ctx,
      qrBoxX + 0,
      qrBoxY + (count - 7) * cellSize,
      cellSize,
      design.cornerStyle,
      fgColor,
    );

    // Draw Logo in Excavated Area
    if (logoBox) {
      const lx = qrBoxX + logoBox.col * cellSize;
      const ly = qrBoxY + logoBox.row * cellSize;
      const lw = logoBox.w * cellSize;
      const lh = logoBox.h * cellSize;

      // Background plate: use QR color (fgColor) for "unpak-simple" because its font is white!
      const isDarkPlate = design.logoType === "unpak-simple";
      ctx.save();
      ctx.fillStyle = isDarkPlate ? fgColor : "#ffffff";

      if (design.logoShape === "circle" && Math.abs(lw - lh) < cellSize * 2) {
        ctx.beginPath();
        ctx.arc(
          lx + lw / 2,
          ly + lh / 2,
          Math.min(lw, lh) / 2,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else {
        const rad = design.logoShape === "square" ? 3 : Math.min(lw, lh) * 0.24;
        const inset = isDarkPlate ? Math.max(1.5, cellSize * 0.25) : 0;
        if (isDarkPlate) {
          // Outer white separator so dark badge doesn't blend into surrounding QR modules
          ctx.fillStyle = "#ffffff";
          drawRoundedRectPath(ctx, lx, ly, lw, lh, rad);
          ctx.fill();
          ctx.fillStyle = fgColor;
        }
        drawRoundedRectPath(
          ctx,
          lx + inset,
          ly + inset,
          lw - inset * 2,
          lh - inset * 2,
          Math.max(2, rad - inset),
        );
        ctx.fill();
      }

      const innerPad = isDarkPlate
        ? Math.max(2.5, cellSize * 0.45)
        : Math.max(1, cellSize * 0.12);
      const availW = lw - innerPad * 2;
      const availH = lh - innerPad * 2;

      if (design.logoType === "unpak-badge" && loadedLogo) {
        // Draw UNPAK emblem on left + "unpak.link" text on right
        const iconSize = Math.min(availH * 0.94, availW * 0.34);
        const totalBadgeW = availW * 0.96;
        const startX = lx + (lw - totalBadgeW) / 2;
        const iconY = ly + (lh - iconSize) / 2;

        ctx.drawImage(loadedLogo, startX, iconY, iconSize, iconSize);

        ctx.fillStyle = fgColor;
        const fontSize = Math.max(9, Math.round(availH * 0.44));
        ctx.font = `800 ${fontSize}px Montserrat, system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(
          "unpak.link",
          startX + iconSize + Math.max(2, cellSize * 0.3),
          ly + lh / 2 + 0.5,
          totalBadgeW - iconSize - 2,
        );
      } else if (loadedLogo) {
        // Preserve aspect ratio (object-contain) so custom/simple logo never stretches
        const ratio =
          loadedLogo.naturalWidth / Math.max(loadedLogo.naturalHeight, 1);
        let drawW = availW;
        let drawH = drawW / ratio;
        if (drawH > availH) {
          drawH = availH;
          drawW = drawH * ratio;
        }
        const dx = lx + (lw - drawW) / 2;
        const dy = ly + (lh - drawH) / 2;

        if (design.logoShape === "circle" && Math.abs(lw - lh) < cellSize * 2) {
          ctx.beginPath();
          ctx.arc(
            lx + lw / 2,
            ly + lh / 2,
            Math.min(availW, availH) / 2,
            0,
            Math.PI * 2,
          );
          ctx.clip();
        }
        ctx.drawImage(loadedLogo, dx, dy, drawW, drawH);
      }
      ctx.restore();
    }

    ctx.restore();
  }, [matrix, design, loadedLogo, size, shortUrl]);

  const hasFrame = design.frameStyle && design.frameStyle !== "none";
  const displayH = hasFrame ? Math.round(size * 1.16) : size;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      {/* Hidden SVG Generator for Exact Reed-Solomon Level H Matrix */}
      <div
        ref={hiddenSvgWrapRef}
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          overflow: "hidden",
          opacity: 0,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <QRCodeSVG
          value={value || "https://unpak.link"}
          level="H"
          marginSize={0}
        />
      </div>

      <canvas
        ref={setCanvasRef}
        style={{ width: size, height: displayH }}
        className="rounded-xl select-none max-w-full h-auto"
      />
    </div>
  );
});

// ================= PRESET DEFINITIONS ======================
const QR_TEMPLATES = [
  {
    id: "classic-center",
    label: "Klasik Tengah",
    patch: {
      frameStyle: "none",
      logoType: "unpak-badge",
      logoPosition: "center",
      bodyShape: "square",
      cornerStyle: "square",
    },
  },
  {
    id: "pill-top-center",
    label: "Pill Atas",
    patch: {
      frameStyle: "top-pill",
      logoType: "unpak-only",
      logoPosition: "center",
      bodyShape: "rounded",
      cornerStyle: "rounded",
    },
  },
  {
    id: "bar-bottom-clean",
    label: "Bar Bawah",
    patch: {
      frameStyle: "bottom-bar",
      logoType: "none",
      logoPosition: "center",
      bodyShape: "square",
      cornerStyle: "square",
    },
  },
  {
    id: "footer-bottom-logo",
    label: "Banner Bawah",
    patch: {
      frameStyle: "bottom-footer",
      logoType: "unpak-only",
      logoPosition: "center",
      bodyShape: "dots",
      cornerStyle: "rounded",
    },
  },
  {
    id: "bar-top-clean",
    label: "Bar Atas",
    patch: {
      frameStyle: "top-bar",
      logoType: "unpak-simple",
      logoPosition: "center",
      bodyShape: "rounded",
      cornerStyle: "rounded",
    },
  },
  {
    id: "pill-top-br",
    label: "Modern UNPAK",
    patch: {
      frameStyle: "top-pill",
      logoType: "unpak-only",
      logoPosition: "bottom-right",
      bodyShape: "rounded",
      cornerStyle: "circle",
    },
  },
  {
    id: "pill-bottom-br",
    label: "Pill Bawah",
    patch: {
      frameStyle: "bottom-pill",
      logoType: "unpak-only",
      logoPosition: "bottom-right",
      bodyShape: "classy",
      cornerStyle: "rounded",
    },
  },
];

const COLOR_PRESETS = [
  { hex: "#111827", name: "Hitam Klasik" },
  { hex: "#49318f", name: "Ungu UNPAK" },
  { hex: "#dc2626", name: "Merah" },
  { hex: "#2563eb", name: "Biru" },
  { hex: "#0f766e", name: "Hijau Emerald" },
  { hex: "#7c3aed", name: "Violet" },
];

const BODY_SHAPES = [
  { id: "square", label: "Kotak" },
  { id: "dots", label: "Bulat" },
  { id: "rounded", label: "Membulat" },
  { id: "classy", label: "Leaf" },
];

const CORNER_STYLES = [
  { id: "square", label: "Kotak" },
  { id: "rounded", label: "Membulat" },
  { id: "circle", label: "Lingkaran" },
];

const LOGO_Positions = [
  { id: "center", label: "Tengah" },
  { id: "bottom-right", label: "Kanan Bawah" },
  { id: "bottom-center", label: "Tengah Bawah" },
  { id: "middle-right", label: "Tengah Kanan" },
];

const FRAME_STYLES = [
  { id: "none", label: "Tanpa Bingkai" },
  { id: "bottom-bar", label: "Bar Bawah" },
  { id: "top-bar", label: "Bar Atas" },
  { id: "top-pill", label: "Pill Atas" },
  { id: "bottom-pill", label: "Pill Bawah" },
  { id: "top-header", label: "Header Atas" },
  { id: "bottom-footer", label: "Footer Bawah" },
];

/**
 * CustomQrModal: Full interactive QR Design Studio Modal
 */
export default function CustomQrModal({
  shortUrl,
  baseUrl = "https://unpak.link",
  initialDesign,
  onClose,
  onSaveDesign,
  addToast,
}) {
  const [design, setDesign] = useState(
    () => initialDesign || getSavedQrDesign(shortUrl),
  );
  const [downloading, setDownloading] = useState(false);
  const previewCanvasRef = useRef(null);
  const hdExportCanvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const fullUrl = `${baseUrl}/${shortUrl}`;

  const updateDesign = (patch) => {
    setDesign((prev) => ({ ...prev, ...patch }));
  };

  // Handle Custom Logo Upload with automatic validation & resizing (max 256px)
  const handleCustomLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/svg+xml",
    ];
    if (!validTypes.includes(file.type)) {
      addToast?.(
        "error",
        "Format logo wajib PNG, WEBP, JPG, atau SVG",
      );
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      addToast?.("error", "Ukuran file logo maksimal 2 MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Compress & bound to max 256x256 so localStorage remains fast & light
        const maxDim = 256;
        let w = img.naturalWidth || 256;
        let h = img.naturalHeight || 256;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const offCanvas = document.createElement("canvas");
        offCanvas.width = w;
        offCanvas.height = h;
        const offCtx = offCanvas.getContext("2d");
        offCtx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = offCanvas.toDataURL("image/png", 0.92);

        updateDesign({
          logoType: "custom",
          customLogoDataUrl: compressedDataUrl,
        });
        addToast?.("success", "Logo custom berhasil diterapkan");
      };
      img.onerror = () => {
        addToast?.("error", "Gagal membaca file gambar logo");
      };
      img.src = ev.target?.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveAndDownload = () => {
    setDownloading(true);
    try {
      saveQrDesign(shortUrl, design);
      onSaveDesign?.(design);

      const exportCanvas = hdExportCanvasRef.current || previewCanvasRef.current;
      if (!exportCanvas) {
        addToast?.("error", "Canvas QR belum siap");
        return;
      }

      const dataUrl = exportCanvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.download = `QR-unpak.link-${shortUrl || "code"}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast?.("success", "Desain disimpan & gambar QR HD berhasil diunduh");
    } catch (err) {
      console.error(err);
      addToast?.("error", "Gagal mengunduh gambar QR");
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveOnly = () => {
    saveQrDesign(shortUrl, design);
    onSaveDesign?.(design);
    addToast?.("success", "Desain QR Code berhasil disimpan");
    onClose?.();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-5xl shadow-2xl border border-gray-100 overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* ================= MODAL HEADER ================= */}
        <div className="px-6 py-4 bg-[#49318f] text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
              Kustomisasi Desain QR Code
            </h2>
            <p className="text-xs text-purple-200">
              unpak.link/{shortUrl}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDesign(DEFAULT_QR_DESIGN)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white flex items-center gap-1.5 transition cursor-pointer"
              title="Kembalikan ke desain default"
            >
              <RotateCcw size={13} />
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ================= MODAL BODY (2 COLUMNS LIKE S.ID) ================= */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* LEFT COLUMN: LIVE QR PREVIEW & EXPORT (5 COLS) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-between bg-gray-50/80 border border-gray-100 rounded-2xl p-5 space-y-5">
            <div className="w-full flex flex-col items-center">
              <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-100 flex items-center justify-center">
                <CustomQrRenderer
                  ref={previewCanvasRef}
                  value={fullUrl}
                  shortUrl={shortUrl}
                  design={design}
                  size={240}
                />
              </div>

              {/* Hidden HD Canvas (900px base) for Crisp PNG Download */}
              <div
                style={{
                  position: "absolute",
                  width: 0,
                  height: 0,
                  overflow: "hidden",
                  opacity: 0,
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              >
                <CustomQrRenderer
                  ref={hdExportCanvasRef}
                  value={fullUrl}
                  shortUrl={shortUrl}
                  design={design}
                  size={900}
                />
              </div>

              <p className="text-xs font-bold text-[#49318f] mt-3 break-all text-center">
                {fullUrl}
              </p>
            </div>

            {/* Frame Label Text Input (when frame is active) */}
            {design.frameStyle !== "none" && (
              <div className="w-full space-y-1">
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  Teks pada Bingkai
                </label>
                <input
                  type="text"
                  maxLength={32}
                  value={design.frameText}
                  onChange={(e) => updateDesign({ frameText: e.target.value })}
                  placeholder={`unpak.link/${shortUrl}`}
                  className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-700 focus:outline-none focus:border-[#49318f]"
                />
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full space-y-2.5 pt-2">
              <button
                type="button"
                onClick={handleSaveAndDownload}
                disabled={downloading}
                className="w-full py-3 px-4 bg-[#49318f] hover:bg-[#382278] text-white rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download size={16} />
                {downloading ? "Menyiapkan Gambar..." : "Simpan & Unduh PNG HD"}
              </button>

              <button
                type="button"
                onClick={handleSaveOnly}
                className="w-full py-2.5 px-4 bg-white hover:bg-gray-100 text-[#49318f] border border-[#49318f]/30 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check size={15} />
                Terapkan Desain ke Kartu Link
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: CUSTOMIZATION CONTROLS (7 COLS) */}
          <div className="lg:col-span-7 space-y-6 pr-1">
            {/* 1. TEMPLATE */}
            <div>
              <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
                Template Cepat
              </h3>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {QR_TEMPLATES.map((tpl) => {
                  const isActive = design.template === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() =>
                        updateDesign({
                          template: tpl.id,
                          ...tpl.patch,
                        })
                      }
                      className={`p-2 rounded-xl border text-center transition flex flex-col items-center justify-between gap-1.5 cursor-pointer ${
                        isActive
                          ? "border-2 border-[#49318f] bg-[#49318f]/5 shadow-2xs"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      {/* Mini Schematic Icon */}
                      <div className="w-10 h-11 rounded border border-gray-300 bg-gray-50 flex flex-col items-center justify-between p-1 relative">
                        {(tpl.patch.frameStyle === "top-pill" ||
                          tpl.patch.frameStyle === "top-bar") && (
                          <div className="w-7 h-1.5 rounded-full bg-gray-800"></div>
                        )}
                        <div className="w-6 h-6 grid grid-cols-3 gap-0.5 my-auto">
                          <span className="bg-gray-800 rounded-[1px]"></span>
                          <span className="bg-gray-400"></span>
                          <span className="bg-gray-800 rounded-[1px]"></span>
                          <span className="bg-gray-400"></span>
                          <span
                            className={`rounded-full ${
                              tpl.patch.logoType !== "none"
                                ? "bg-[#49318f]"
                                : "bg-gray-300"
                            }`}
                          ></span>
                          <span className="bg-gray-400"></span>
                          <span className="bg-gray-800 rounded-[1px]"></span>
                          <span className="bg-gray-400"></span>
                          <span
                            className={
                              tpl.patch.logoPosition === "bottom-right"
                                ? "bg-[#49318f] rounded-full"
                                : "bg-gray-500"
                            }
                          ></span>
                        </div>
                        {(tpl.patch.frameStyle === "bottom-bar" ||
                          tpl.patch.frameStyle === "bottom-pill" ||
                          tpl.patch.frameStyle === "bottom-footer") && (
                          <div className="w-7 h-1.5 rounded-full bg-gray-800"></div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-gray-600 leading-tight">
                        {tpl.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. WARNA QR & 3. BENTUK (1 ROW) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* WARNA QR */}
              <div>
                <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
                  Warna QR
                </h3>
                <div className="flex flex-wrap items-center gap-2.5">
                  {COLOR_PRESETS.map((c) => {
                    const isSelected =
                      design.color?.toLowerCase() === c.hex.toLowerCase();
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() => updateDesign({ color: c.hex })}
                        title={c.name}
                        className={`w-9 h-9 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                          isSelected
                            ? "ring-2 ring-offset-2 ring-[#49318f] scale-110"
                            : "hover:scale-105"
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {isSelected && (
                          <Check size={15} className="text-white stroke-[3]" />
                        )}
                      </button>
                    );
                  })}

                  {/* Custom Color Wheel Picker */}
                  <label
                    title="Pilih warna bebas (Custom Color)"
                    className="w-9 h-9 rounded-full cursor-pointer relative overflow-hidden border border-gray-300 shadow-2xs hover:scale-105 transition-transform flex items-center justify-center"
                    style={{
                      background:
                        "conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                    }}
                  >
                    <input
                      type="color"
                      value={design.color}
                      onChange={(e) => updateDesign({ color: e.target.value })}
                      className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* BENTUK (BODY DOTS) */}
              <div>
                <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
                  Bentuk Titik
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {BODY_SHAPES.map((b) => {
                    const isActive = design.bodyShape === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => updateDesign({ bodyShape: b.id })}
                        className={`py-2 px-1 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                          isActive
                            ? "border-2 border-[#49318f] bg-[#49318f]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="grid grid-cols-2 gap-1 w-6 h-6 p-0.5">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              style={{ backgroundColor: design.color }}
                              className={
                                b.id === "dots"
                                  ? "rounded-full"
                                  : b.id === "rounded"
                                    ? "rounded-[3px]"
                                    : b.id === "classy"
                                      ? "rounded-tl-[4px] rounded-br-[4px]"
                                      : ""
                              }
                            ></span>
                          ))}
                        </div>
                        <span className="text-[10px] font-bold text-gray-600">
                          {b.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 4. SUDUT & 5. LOGO (1 ROW) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
              {/* SUDUT (3 EYE CORNERS) */}
              <div className="sm:col-span-5">
                <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
                  Sudut
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {CORNER_STYLES.map((c) => {
                    const isActive = design.cornerStyle === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => updateDesign({ cornerStyle: c.id })}
                        className={`py-2.5 px-2 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                          isActive
                            ? "border-2 border-[#49318f] bg-[#49318f]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div
                          style={{ borderColor: design.color }}
                          className={`w-6 h-6 border-[3px] flex items-center justify-center ${
                            c.id === "circle"
                              ? "rounded-full"
                              : c.id === "rounded"
                                ? "rounded-md"
                                : "rounded-none"
                          }`}
                        >
                          <div
                            style={{ backgroundColor: design.color }}
                            className={`w-2.5 h-2.5 ${
                              c.id === "circle"
                                ? "rounded-full"
                                : c.id === "rounded"
                                  ? "rounded-[2px]"
                                  : "rounded-none"
                            }`}
                          ></div>
                        </div>
                        <span className="text-[10px] font-bold text-gray-600">
                          {c.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LOGO */}
              <div className="sm:col-span-7">
                <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
                  Pilihan Logo
                </h3>
                <div className="grid grid-cols-5 gap-2">
                  {/* 1. Logo UNPAK (Logo Only - Default) */}
                  <button
                    type="button"
                    onClick={() => updateDesign({ logoType: "unpak-only" })}
                    title="Logo Resmi UNPAK (Lambang Saja)"
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                      design.logoType === "unpak-only"
                        ? "border-2 border-[#49318f] bg-[#49318f]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <img
                      src={logoUnpakOnly}
                      alt="Logo UNPAK"
                      className="w-6 h-6 object-contain"
                    />
                    <span className="text-[9px] font-bold text-gray-600">
                      UNPAK
                    </span>
                  </button>

                  {/* 2. Logo UNPAK + Nama (logo-unpak-simple.webp) */}
                  <button
                    type="button"
                    onClick={() => updateDesign({ logoType: "unpak-simple" })}
                    title="Logo UNPAK dengan Teks Nama"
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                      design.logoType === "unpak-simple"
                        ? "border-2 border-[#49318f] bg-[#49318f]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <img
                      src={logoUnpakSimple}
                      alt="Logo UNPAK Teks"
                      className="h-6 w-auto object-contain bg-[#49318f] p-0.5 rounded"
                    />
                    <span className="text-[9px] font-bold text-gray-600">
                      UNPAK Teks
                    </span>
                  </button>

                  {/* 3. Badge unpak.link */}
                  <button
                    type="button"
                    onClick={() => updateDesign({ logoType: "unpak-badge" })}
                    title="Logo + Teks unpak.link"
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                      design.logoType === "unpak-badge"
                        ? "border-2 border-[#49318f] bg-[#49318f]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-center gap-0.5 h-6">
                      <img
                        src={logoUnpakOnly}
                        alt="Badge"
                        className="w-4 h-4 object-contain"
                      />
                      <span className="text-[8px] font-extrabold text-[#49318f]">
                        unpak
                      </span>
                    </div>
                    <span className="text-[9px] font-bold text-gray-600">
                      Badge
                    </span>
                  </button>

                  {/* 4. Tanpa Logo */}
                  <button
                    type="button"
                    onClick={() => updateDesign({ logoType: "none" })}
                    title="Tanpa Logo"
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                      design.logoType === "none"
                        ? "border-2 border-[#49318f] bg-[#49318f]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full border-2 border-gray-400 flex items-center justify-center text-gray-400 text-xs font-bold">
                      /
                    </div>
                    <span className="text-[9px] font-bold text-gray-600">
                      Tanpa
                    </span>
                  </button>

                  {/* 5. Upload Logo Sendiri */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload Logo Sendiri (PNG/WEBP/JPG/SVG maks 2MB)"
                    className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition cursor-pointer ${
                      design.logoType === "custom"
                        ? "border-2 border-[#49318f] bg-[#49318f]/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {design.customLogoDataUrl ? (
                      <img
                        src={design.customLogoDataUrl}
                        alt="Custom"
                        className="w-6 h-6 object-contain rounded"
                      />
                    ) : (
                      <div className="w-6 h-6 flex items-center justify-center text-[#49318f]">
                        <Upload size={16} />
                      </div>
                    )}
                    <span className="text-[9px] font-bold text-gray-600">
                      Upload
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleCustomLogoUpload}
                    className="hidden"
                  />
                </div>

                {/* Pengaturan Bentuk Wadah Logo & Panduan Ukuran */}
                {design.logoType !== "none" && (
                  <div className="mt-2.5 bg-gray-50 border border-gray-200/80 rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-gray-600">
                        Bentuk Alas Logo:
                      </span>
                      <div className="flex gap-1.5">
                        {[
                          { id: "rounded", label: "Membulat" },
                          { id: "circle", label: "Bulat" },
                          { id: "square", label: "Kotak" },
                        ].map((sh) => (
                          <button
                            key={sh.id}
                            type="button"
                            onClick={() => updateDesign({ logoShape: sh.id })}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                              design.logoShape === sh.id
                                ? "bg-[#49318f] text-white border-[#49318f]"
                                : "bg-white text-gray-600 border-gray-200"
                            }`}
                          >
                            {sh.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      <b>Aturan Logo Custom:</b> Format PNG/WEBP/JPG/SVG (maks 2
                      MB). Rasio persegi (1:1) atau persegi panjang (hingga
                      2.5:1) otomatis disesuaikan maks 20% area QR agar tetap
                      100% aman di-scan.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 6. POSISI LOGO */}
            {design.logoType !== "none" && (
              <div>
                <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
                  Posisi Logo
                </h3>
                <div className="grid grid-cols-4 gap-2.5 max-w-md">
                  {LOGO_Positions.map((pos) => {
                    const isActive = design.logoPosition === pos.id;
                    return (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => updateDesign({ logoPosition: pos.id })}
                        className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                          isActive
                            ? "border-2 border-[#49318f] bg-[#49318f]/5"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="w-7 h-7 border-2 border-gray-400 rounded-md relative bg-white">
                          <span
                            style={{ backgroundColor: design.color }}
                            className={`w-2.5 h-2.5 rounded-[2px] absolute ${
                              pos.id === "center"
                                ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                                : pos.id === "bottom-right"
                                  ? "bottom-0.5 right-0.5"
                                  : pos.id === "bottom-center"
                                    ? "bottom-0.5 left-1/2 -translate-x-1/2"
                                    : "top-1/2 right-0.5 -translate-y-1/2"
                            }`}
                          ></span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-600">
                          {pos.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 7. BINGKAI */}
            <div>
              <h3 className="text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2.5">
                Bingkai
              </h3>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {FRAME_STYLES.map((fr) => {
                  const isActive = design.frameStyle === fr.id;
                  return (
                    <button
                      key={fr.id}
                      type="button"
                      onClick={() => updateDesign({ frameStyle: fr.id })}
                      className={`p-2 rounded-xl border flex flex-col items-center justify-between gap-1.5 transition cursor-pointer ${
                        isActive
                          ? "border-2 border-[#49318f] bg-[#49318f]/5"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div
                        className={`w-9 h-10 rounded-md flex flex-col justify-between p-1 ${
                          fr.id === "none"
                            ? "border border-dashed border-gray-300 bg-gray-50"
                            : "border-2 border-gray-700 bg-gray-100"
                        }`}
                      >
                        {(fr.id === "top-bar" ||
                          fr.id === "top-pill" ||
                          fr.id === "top-header") && (
                          <div
                            style={{ backgroundColor: design.color }}
                            className={`h-1.5 w-full ${
                              fr.id === "top-pill" ? "rounded-full mx-auto w-6" : "rounded-[2px]"
                            }`}
                          ></div>
                        )}
                        <div className="my-auto"></div>
                        {(fr.id === "bottom-bar" ||
                          fr.id === "bottom-pill" ||
                          fr.id === "bottom-footer") && (
                          <div
                            style={{ backgroundColor: design.color }}
                            className={`h-1.5 w-full ${
                              fr.id === "bottom-pill"
                                ? "rounded-full mx-auto w-6"
                                : "rounded-[2px]"
                            }`}
                          ></div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-gray-600 text-center leading-tight">
                        {fr.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
