import {
  PDFDocument,
  PDFName,
  PDFPage,
  PDFFont,
  PDFImage,
  RGB,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  concatTransformationMatrix,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface PrintItem {
  id: string;
  sku: string;
  name: string;
  brand?: string | null;
  price?: number | null;
  safetyText?: string | null;
  contactText?: string | null;
  ean?: string | null;
  note?: string | null;
  quantity: number;
}

export interface CustomIconConfig {
  id: string;
  name: string;
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center' | 'center' | 'middle-left' | 'middle-right';
  imageData: string; // base64 data URL (PNG or JPG)
  iconWidth: number; // mm
  iconHeight: number; // mm
  fillAllCells?: boolean;
}

interface EmbeddedIcon {
  config: CustomIconConfig;
  embedded: PDFImage | null;
}

interface FieldsConfig {
  showBrand?: boolean;
  showName?: boolean;
  showSku?: boolean;
  showEan?: boolean;
  showPrice?: boolean;
  showSafetyText?: boolean;
  showSafetyIcon?: boolean;
  showContactText?: boolean;
  showContactIcon?: boolean;
  showNote?: boolean;
}

interface FontConfig {
  textAlignment?: 'left' | 'center' | 'right';
  brandColor?: string;
  nameColor?: string;
  priceColor?: string;
  bodyColor?: string;
  brandFontSize?: number;
  nameFontSize?: number;
  skuFontSize?: number;
  priceFontSize?: number;
  bodyFontSize?: number;
  [key: string]: unknown;
}

interface DrawContentArgs {
  /** x of the left edge of the drawing area (in current coordinate system) */
  originX: number;
  /** y of the bottom of the label space (in current coordinate system) */
  originY: number;
  /** text wrap width (x direction) */
  contentW: number;
  /** full height available for content (y direction) */
  totalH: number;
  /** x of right edge, for price right-alignment */
  rightEdgeX: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) {
    return rgb(parseInt(h[0]+h[0],16)/255, parseInt(h[1]+h[1],16)/255, parseInt(h[2]+h[2],16)/255);
  }
  if (h.length === 6) {
    return rgb(parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255);
  }
  return rgb(0, 0, 0);
}

function getAlignX(blockW: number, contentW: number, alignment: 'left'|'center'|'right'): number {
  if (alignment === 'center') return Math.max(0, (contentW - blockW) / 2);
  if (alignment === 'right')  return Math.max(0, contentW - blockW);
  return 0;
}

function wrapText(text: string, maxWidth: number, font: PDFFont, fontSize: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
        cur = word;
      } else {
        // Force-break at character level
        let partial = '';
        for (const ch of word) {
          if (font.widthOfTextAtSize(partial + ch, fontSize) <= maxWidth) {
            partial += ch;
          } else {
            if (partial) lines.push(partial);
            partial = ch;
          }
        }
        cur = partial;
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function base64ToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Icon primitives ──────────────────────────────────────────────────────────

const drawWarningIcon = (page: PDFPage, x: number, y: number, h: number) => {
  const w = h * 1.2;
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(0.9,0.5,0.1), borderColor: rgb(0.9,0.5,0.1), borderWidth: 0 });
  page.drawLine({ start:{x: x+w/2, y: y+2}, end:{x: x+w/2, y: y+h-1.5}, thickness:0.9, color: rgb(1,1,1) });
  page.drawLine({ start:{x: x+w/2, y: y+0.8}, end:{x: x+w/2, y: y+1.4}, thickness:0.9, color: rgb(1,1,1) });
};

const drawEnvelopeIcon = (page: PDFPage, x: number, y: number, w: number, h: number, color: RGB) => {
  page.drawRectangle({ x, y, width:w, height:h, borderWidth:0.6, borderColor:color, color:rgb(1,1,1) });
  page.drawLine({ start:{x, y:y+h}, end:{x:x+w/2, y:y+h/2}, thickness:0.5, color });
  page.drawLine({ start:{x:x+w, y:y+h}, end:{x:x+w/2, y:y+h/2}, thickness:0.5, color });
};

// ─── Core content renderer ─────────────────────────────────────────────────────
// Works for both normal and rotated modes (after the transform is applied).
// In rotated mode, the caller applies concatTransformationMatrix so that
// draw_x=horizontal (visual reading direction) and draw_y=vertical (line direction).

function drawLabelContent(
  page: PDFPage,
  product: Omit<PrintItem,'quantity'>,
  fields: FieldsConfig,
  fonts: FontConfig,
  args: DrawContentArgs,
  regularFont: PDFFont,
  boldFont: PDFFont,
  isRotated: boolean = false
) {
  const { originX, originY, contentW, totalH } = args;
  const padding = 4;
  const alignment = fonts.textAlignment || 'left';
  const brandColor = hexToRgb(fonts.brandColor || '#64748b');
  const nameColor  = hexToRgb(fonts.nameColor  || '#0f172a');
  const priceColor = hexToRgb(fonts.priceColor || '#dc2626');
  const bodyColor  = hexToRgb(fonts.bodyColor  || '#334155');

  let currentY = originY + totalH - padding;
  const minY   = originY + padding;

  // 1. Brand
  if (fields.showBrand && product.brand) {
    const sz  = fonts.brandFontSize || 7;
    const txt = String(product.brand).toUpperCase();
    const tw  = boldFont.widthOfTextAtSize(txt, sz);
    const xOff = getAlignX(tw, contentW, alignment);
    currentY -= sz;
    page.drawText(txt, { x: originX+xOff, y: currentY, size: sz, font: boldFont, color: brandColor });
    currentY -= 2;
  }

  // 2. Product name (≤ 2 lines)
  if (fields.showName && product.name) {
    const sz    = fonts.nameFontSize || 9.5;
    const lines = wrapText(product.name, contentW, boldFont, sz);
    const draw  = lines.slice(0, 2);
    if (lines.length > 2) draw[1] = draw[1].slice(0, Math.max(0, draw[1].length-3)) + '...';
    for (const line of draw) {
      if (currentY - sz < minY) break;
      const tw   = boldFont.widthOfTextAtSize(line, sz);
      const xOff = getAlignX(tw, contentW, alignment);
      currentY -= sz;
      page.drawText(line, { x: originX+xOff, y: currentY, size: sz, font: boldFont, color: nameColor });
      currentY -= 1.5;
    }
    currentY -= 2;
  }

  // 3. SKU/EAN row
  const priceVal  = product.price !== null && product.price !== undefined ? product.price : null;
  const showPrice = !!(fields.showPrice && priceVal !== null);
  let codeText = '';
  if (fields.showSku  && product.sku) codeText += `SKU: ${product.sku}`;
  if (fields.showEan  && product.ean) { if (codeText) codeText += ' | '; codeText += `EAN: ${product.ean}`; }
  const showCode = (fields.showSku || fields.showEan) && codeText.length > 0;

  if (showCode) {
    const csz = fonts.skuFontSize || 6.5;
    const cw = regularFont.widthOfTextAtSize(codeText, csz);
    const xOff = getAlignX(cw, contentW, alignment);
    if (currentY - csz >= minY) {
      currentY -= csz;
      page.drawText(codeText, { x: originX + xOff, y: currentY, size: csz, font: regularFont, color: bodyColor });
      currentY -= 3;
    }
  }

  // 4. Safety text
  if (fields.showSafetyText && product.safetyText) {
    const sz    = fonts.bodyFontSize || 6;
    const iconW = (fields.showSafetyIcon && !isRotated) ? 11 : 0;
    const avW   = contentW - (alignment==='left' ? iconW : 0);
    const lines = wrapText(product.safetyText, avW, regularFont, sz);
    let first   = true;
    for (const line of lines) {
      if (currentY - sz < minY) break;
      const lw   = regularFont.widthOfTextAtSize(line, sz);
      const bw   = (first ? iconW : 0) + lw;
      const xOff = getAlignX(bw, contentW, alignment);
      currentY  -= sz;
      let tx = originX + xOff;
      if (first && fields.showSafetyIcon && !isRotated) { drawWarningIcon(page, tx, currentY+(sz-7)/2, 7); tx += 11; first = false; }
      else if (first) first = false;
      page.drawText(line, { x: tx, y: currentY, size: sz, font: regularFont, color: bodyColor });
      currentY -= 1.5;
    }
    currentY -= 2.5;
  }

  // 5. Price
  if (showPrice) {
    const psz = fonts.priceFontSize || 11;
    const pt = `${priceVal} Kč`;
    const ptw = boldFont.widthOfTextAtSize(pt, psz);
    const xOff = alignment === 'left' ? (contentW - ptw) : getAlignX(ptw, contentW, alignment);
    if (currentY - psz >= minY) {
      currentY -= psz;
      page.drawText(pt, { x: originX + xOff, y: currentY, size: psz, font: boldFont, color: priceColor });
      currentY -= 4;
    }
  }

  // 5. Contact text (supports newlines)
  if (fields.showContactText && product.contactText) {
    const sz    = fonts.bodyFontSize || 6;
    const iconW = (fields.showContactIcon && !isRotated) ? 11 : 0;
    const parts = String(product.contactText).split('\n');
    let first   = true;
    for (const part of parts) {
      if (!part.trim()) continue;
      const avW  = contentW - (alignment==='left' && first ? iconW : 0);
      const wrp  = wrapText(part.trim(), avW, regularFont, sz);
      for (const line of wrp) {
        if (currentY - sz < minY) break;
        const lw   = regularFont.widthOfTextAtSize(line, sz);
        const bw   = (first ? iconW : 0) + lw;
        const xOff = getAlignX(bw, contentW, alignment);
        currentY  -= sz;
        let tx = originX + xOff;
        if (first && fields.showContactIcon && !isRotated) { drawEnvelopeIcon(page, tx, currentY+(sz-6)/2, 8, 6, bodyColor); tx += 11; first = false; }
        else if (first) first = false;
        page.drawText(line, { x: tx, y: currentY, size: sz, font: regularFont, color: bodyColor });
        currentY -= 1.5;
      }
    }
  }
}

// ─── Custom image icons ────────────────────────────────────────────────────────

function drawCustomIcons(
  page: PDFPage,
  icons: EmbeddedIcon[],
  x: number, y: number,
  labelW: number, labelH: number,
  padding: number
) {
  const mm = 2.83464567;
  for (const icon of icons) {
    if (!icon.embedded) continue;
    const iw = icon.config.iconWidth  * mm;
    const ih = icon.config.iconHeight * mm;
    let ix: number, iy: number;
    switch (icon.config.position) {
      case 'top-left':
        ix = x + padding;
        iy = y + labelH - ih - padding;
        break;
      case 'top-right':
        ix = x + labelW - iw - padding;
        iy = y + labelH - ih - padding;
        break;
      case 'top-center':
        ix = x + (labelW - iw) / 2;
        iy = y + labelH - ih - padding;
        break;
      case 'bottom-left':
        ix = x + padding;
        iy = y + padding;
        break;
      case 'bottom-center':
        ix = x + (labelW - iw) / 2;
        iy = y + padding;
        break;
      case 'middle-left':
        ix = x + padding;
        iy = y + (labelH - ih) / 2;
        break;
      case 'middle-right':
        ix = x + labelW - iw - padding;
        iy = y + (labelH - ih) / 2;
        break;
      case 'center':
        ix = x + (labelW - iw) / 2;
        iy = y + (labelH - ih) / 2;
        break;
      case 'bottom-right':
      default:
        ix = x + labelW - iw - padding;
        iy = y + padding;
        break;
    }
    page.drawImage(icon.embedded, { x: ix, y: iy, width: iw, height: ih });
  }
}

function drawCustomIconsSix(
  page: PDFPage,
  icons: EmbeddedIcon[],
  x: number, y: number,
  labelW: number, labelH: number
) {
  const mm = 2.83464567;
  const cellW = labelW / 3;
  const cellH = labelH / 2;

  const positions = [
    { name: 'top-left', col: 0, row: 1 },
    { name: 'top-center', col: 1, row: 1 },
    { name: 'top-right', col: 2, row: 1 },
    { name: 'bottom-left', col: 0, row: 0 },
    { name: 'bottom-center', col: 1, row: 0 },
    { name: 'bottom-right', col: 2, row: 0 },
  ];

  const fillIcon = icons.find((i) => i.config.fillAllCells);

  for (const pos of positions) {
    const icon = fillIcon || icons.find((i) => i.config.position === pos.name);
    if (!icon || !icon.embedded) continue;

    const iw = icon.config.iconWidth * mm;
    const ih = icon.config.iconHeight * mm;

    // Center of the cell
    const cellCenterX = x + pos.col * cellW + cellW / 2;
    const cellCenterY = y + pos.row * cellH + cellH / 2;

    const ix = cellCenterX - iw / 2;
    const iy = cellCenterY - ih / 2;

    page.drawImage(icon.embedded, { x: ix, y: iy, width: iw, height: ih });
  }
}

// ─── Main label renderer ───────────────────────────────────────────────────────

function drawLabel(
  page: PDFPage,
  product: Omit<PrintItem,'quantity'>,
  row: number,
  col: number,
  template: { fieldsConfig: string; fontConfig: string; layoutConfig: string },
  regularFont: PDFFont,
  boldFont: PDFFont,
  embeddedIcons: EmbeddedIcon[],
  fontOverrides?: {
    nameFontSize?: number;
    skuFontSize?: number;
    brandFontSize?: number;
    priceFontSize?: number;
    bodyFontSize?: number;
  }
) {
  const fields = JSON.parse(template.fieldsConfig);
  const fonts  = { ...JSON.parse(template.fontConfig), ...fontOverrides };
  const layout = JSON.parse(template.layoutConfig);

  const mm  = 2.83464567;
  const A4H = 841.890;

  const labelW = layout.labelWidth  * mm;
  const labelH = layout.labelHeight * mm;
  const leftM  = layout.leftMargin  * mm;
  const topM   = layout.topMargin   * mm;
  const gapH   = layout.horizontalGap * mm;
  const gapV   = (layout.verticalGap || 0) * mm;

  const x = leftM + col * (labelW + gapH);
  const y = A4H - topM - row * (labelH + gapV) - labelH;

  const isRotated = (layout.labelRotation || 0) === 90;
  const isDual    = !!(layout.dualLayout);
  const padding   = 4;

  // ── Outer graphics state: clipping only ────────────────────────────────────
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x, y), lineTo(x+labelW, y), lineTo(x+labelW, y+labelH), lineTo(x, y+labelH),
    closePath(), clip(), endPath()
  );

  if (layout.sixIconsLayout) {
    const color = rgb(0.85, 0.85, 0.85);
    const lineThickness = 0.3;

    // Horizontal divider
    page.drawLine({
      start: { x, y: y + labelH / 2 },
      end: { x: x + labelW, y: y + labelH / 2 },
      thickness: lineThickness,
      color,
    });

    // Vertical dividers
    page.drawLine({
      start: { x: x + labelW / 3, y },
      end: { x: x + labelW / 3, y: y + labelH },
      thickness: lineThickness,
      color,
    });
    page.drawLine({
      start: { x: x + (2 * labelW) / 3, y },
      end: { x: x + (2 * labelW) / 3, y: y + labelH },
      thickness: lineThickness,
      color,
    });

    drawCustomIconsSix(page, embeddedIcons, x, y, labelW, labelH);

    // Restore outer state (removes clip)
    page.pushOperators(popGraphicsState());
    return;
  }

  if (isRotated) {
    // ── Rotation transform ─────────────────────────────────────────────────
    // Transform [0,-1,1,0,x,y+labelH] maps:
    //   (draw_x, draw_y) → PDF (draw_y+x,  -draw_x+y+labelH)
    // After transform the drawing space is 90° CW rotated.
    // Text drawn here reads bottom→top in physical label = left→right when
    // label is held portrait (short side up, 90° CCW from landscape).
    //
    // In rotated drawing space:
    //   contentW = labelH - 2*padding  (short physical dim → visual "width")
    //   totalH   = labelW              (long physical dim  → visual "height")
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(0, -1, 1, 0, x, y + labelH)
    );

    if (isDual) {
      // Split along draw_y (visual height = long dimension / 2)
      const halfH = labelW / 2 - 0.5;
      // Top half (visual): draw_y from labelW/2+0.5 to labelW
      drawLabelContent(page, product, fields, fonts, {
        originX: padding, originY: labelW/2 + 0.5,
        contentW: labelH - 2*padding, totalH: halfH, rightEdgeX: labelH - padding,
      }, regularFont, boldFont, true);
      // Divider (horizontal line at draw_y = labelW/2, visual middle)
      page.drawLine({ start:{x:0, y:labelW/2}, end:{x:labelH, y:labelW/2}, thickness:0.3, color:rgb(0.75,0.75,0.75) });
      // Bottom half (visual): draw_y from 0 to labelW/2-0.5
      drawLabelContent(page, product, fields, fonts, {
        originX: padding, originY: 0,
        contentW: labelH - 2*padding, totalH: halfH, rightEdgeX: labelH - padding,
      }, regularFont, boldFont, true);
    } else {
      drawLabelContent(page, product, fields, fonts, {
        originX: padding, originY: 0,
        contentW: labelH - 2*padding, totalH: labelW, rightEdgeX: labelH - padding,
      }, regularFont, boldFont, true);
    }

    // Remove rotation; outer clip still active
    page.pushOperators(popGraphicsState());

  } else {
    // ── Normal (landscape) mode ────────────────────────────────────────────
    if (isDual) {
      const halfW = (labelW - 2*padding - 1) / 2;
      // Left half
      drawLabelContent(page, product, fields, fonts, {
        originX: x + padding, originY: y,
        contentW: halfW, totalH: labelH, rightEdgeX: x + labelW/2 - 0.5,
      }, regularFont, boldFont, false);
      // Divider (vertical)
      page.drawLine({ start:{x:x+labelW/2, y}, end:{x:x+labelW/2, y:y+labelH}, thickness:0.3, color:rgb(0.75,0.75,0.75) });
      // Right half
      drawLabelContent(page, product, fields, fonts, {
        originX: x + labelW/2 + 0.5, originY: y,
        contentW: halfW, totalH: labelH, rightEdgeX: x + labelW - padding,
      }, regularFont, boldFont, false);
    } else {
      drawLabelContent(page, product, fields, fonts, {
        originX: x + padding, originY: y,
        contentW: labelW - 2*padding, totalH: labelH, rightEdgeX: x + labelW - padding,
      }, regularFont, boldFont, false);
    }
  }

  // Custom image icons are always drawn in physical coordinates (no rotation)
  drawCustomIcons(page, embeddedIcons, x, y, labelW, labelH, padding);

  // Restore outer state (removes clip)
  page.pushOperators(popGraphicsState());
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateLabelsPdf(
  items: PrintItem[],
  template: { fieldsConfig: string; fontConfig: string; layoutConfig: string },
  startPosition: number,
  fontOverrides?: {
    nameFontSize?: number;
    skuFontSize?: number;
    brandFontSize?: number;
    priceFontSize?: number;
    bodyFontSize?: number;
  }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Set PDF ViewerPreferences to enforce 100% print scaling (Actual Size, no shrinkage)
  const viewerPrefs = pdfDoc.context.obj({
    PrintScaling: PDFName.of('None'),
    PickTrayByPDFSize: true,
  });
  pdfDoc.catalog.set(PDFName.of('ViewerPreferences'), viewerPrefs);

  // Load Roboto fonts (Czech UTF-8 support)
  const [regularFontBytes, boldFontBytes] = await Promise.all([
    fetch('/fonts/Roboto-Regular.ttf').then(r => { if (!r.ok) throw new Error('Regular font failed'); return r.arrayBuffer(); }),
    fetch('/fonts/Roboto-Bold.ttf').then(r => { if (!r.ok) throw new Error('Bold font failed'); return r.arrayBuffer(); }),
  ]);
  const regularFont = await pdfDoc.embedFont(regularFontBytes);
  const boldFont    = await pdfDoc.embedFont(boldFontBytes);

  // Pre-embed custom icons
  const layout     = JSON.parse(template.layoutConfig);
  const iconConfigs: CustomIconConfig[] = layout.customIcons || [];
  const embeddedIcons: EmbeddedIcon[] = await Promise.all(
    iconConfigs.map(async (cfg) => {
      try {
        const bytes = base64ToUint8Array(cfg.imageData);
        const dataLower = cfg.imageData.toLowerCase();
        const embedded = dataLower.includes('image/jpeg') || dataLower.includes('image/jpg')
          ? await pdfDoc.embedJpg(bytes)
          : await pdfDoc.embedPng(bytes);
        return { config: cfg, embedded };
      } catch {
        return { config: cfg, embedded: null };
      }
    })
  );

  // Flatten print list
  const labelProducts: Omit<PrintItem,'quantity'>[] = [];
  for (const item of items) {
    for (let q = 0; q < item.quantity; q++) {
      labelProducts.push({ id:item.id, sku:item.sku, name:item.name, brand:item.brand,
        price:item.price, safetyText:item.safetyText, contactText:item.contactText,
        ean:item.ean, note:item.note });
    }
  }

  if (labelProducts.length === 0) {
    pdfDoc.addPage([595.275, 841.890]);
    return pdfDoc.save();
  }

  // Auto-calculate columns and rows from A4 dimensions (210×297 mm)
  const lw = layout.labelWidth || 63.5;
  const lh = layout.labelHeight || 38.1;
  const lm = layout.leftMargin || 7.25;
  const tm = layout.topMargin || 15.15;
  const hg = layout.horizontalGap || 2.5;
  const vg = layout.verticalGap || 0;
  const cols         = Math.max(1, Math.floor((210 - lm + hg) / (lw + hg)));
  const rows         = Math.max(1, Math.floor((297 - tm + vg) / (lh + vg)));
  const labelsPerPage = cols * rows;
  let currentIndex   = startPosition - 1;
  let page           = pdfDoc.addPage([595.275, 841.890]);

  for (const product of labelProducts) {
    if (currentIndex >= labelsPerPage) {
      page = pdfDoc.addPage([595.275, 841.890]);
      currentIndex = 0;
    }
    const r = Math.floor(currentIndex / cols);
    const c = currentIndex % cols;
    drawLabel(page, product, r, c, template, regularFont, boldFont, embeddedIcons, fontOverrides);
    currentIndex++;
  }

  return pdfDoc.save();
}
