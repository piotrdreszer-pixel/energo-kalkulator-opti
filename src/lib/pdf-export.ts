import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type PdfExportOptions = {
  filename: string;
  marginMm?: number;
  scale?: number;
  avoidBreakSelector?: string;
  /** Minimal slice height (DOM px). Prevents creating extremely tiny first pages. */
  minSliceDomPx?: number;
};

type AvoidBlock = {
  topDomPx: number;
  bottomDomPx: number;
};

function getAvoidBlocks(container: HTMLElement, selector: string): AvoidBlock[] {
  const containerRect = container.getBoundingClientRect();
  const blocks: AvoidBlock[] = [];

  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    const topDomPx = r.top - containerRect.top + container.scrollTop;
    const bottomDomPx = topDomPx + el.offsetHeight;
    if (Number.isFinite(topDomPx) && Number.isFinite(bottomDomPx) && bottomDomPx > topDomPx) {
      blocks.push({ topDomPx, bottomDomPx });
    }
  }

  // Sort by top, merge overlaps
  blocks.sort((a, b) => a.topDomPx - b.topDomPx);
  const merged: AvoidBlock[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (!last || b.topDomPx > last.bottomDomPx) merged.push(b);
    else last.bottomDomPx = Math.max(last.bottomDomPx, b.bottomDomPx);
  }
  return merged;
}

function findBlockContainingY(blocks: AvoidBlock[], yDomPx: number) {
  return blocks.find((b) => yDomPx > b.topDomPx && yDomPx < b.bottomDomPx);
}

/**
 * Generates a multi-page A4 PDF from a DOM element.
 * Page breaks are adjusted to avoid splitting elements matched by avoidBreakSelector.
 */
export async function exportElementToPdf(container: HTMLElement, opts: PdfExportOptions) {
  const margin = opts.marginMm ?? 10;
  const scale = opts.scale ?? 2;
  const avoidBreakSelector = opts.avoidBreakSelector ?? '.print-avoid-break';
  const minSliceDomPx = opts.minSliceDomPx ?? 180;

  // 1) Render DOM → canvas
  const canvas = await html2canvas(container, {
  scale: Math.max(scale, 2.5),
  useCORS: true,
  logging: false,
  backgroundColor: '#ffffff',
  allowTaint: false,
  foreignObjectRendering: false,
  imageTimeout: 15000,
  onclone: (clonedDoc) => {
    const clonedBody = clonedDoc.body;
    clonedBody.style.background = '#ffffff';

    const clonedContainer = clonedDoc.querySelector('[data-pdf-root="true"]') as HTMLElement | null;
    if (clonedContainer) {
      clonedContainer.style.maxWidth = '210mm';
      clonedContainer.style.width = '210mm';
      clonedContainer.style.margin = '0';
      clonedContainer.style.padding = '0';
      clonedContainer.style.background = '#ffffff';
      clonedContainer.style.boxSizing = 'border-box';
    }
  },
});

  // 2) Setup PDF
 const pdf = new jsPDF({
  orientation: 'portrait',
  unit: 'mm',
  format: 'a4',
  compress: true,
});
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const availableWidthMm = pdfWidth - 2 * margin;
  const availableHeightMm = pdfHeight - 2 * margin;

  // 3) Map DOM px → canvas px
  const containerWidthDomPx = container.getBoundingClientRect().width || container.scrollWidth;
  const canvasPxPerDomPx = containerWidthDomPx > 0 ? canvas.width / containerWidthDomPx : scale;

  // When fitting canvas to availableWidthMm, determine how many canvas pixels fit one page height.
  const pageHeightCanvasPx = Math.floor((canvas.width * availableHeightMm) / availableWidthMm);
  const pageHeightDomPx = pageHeightCanvasPx / canvasPxPerDomPx;

  // 4) Compute avoid-break blocks in DOM pixels
  const avoidBlocks = getAvoidBlocks(container, avoidBreakSelector);

  // 5) Slice canvas by computed breakpoints
  const sourceWidthPx = canvas.width;
  const sourceHeightPx = canvas.height;

  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d');
  if (!scratchCtx) throw new Error('Nie udało się utworzyć kontekstu canvas dla PDF');
  scratch.width = sourceWidthPx;

  let yDom = 0;
  let pageIndex = 0;

  while (true) {
    const remainingDom = container.scrollHeight - yDom;
    if (remainingDom <= 0) break;

    let targetBreakDom = Math.min(yDom + pageHeightDomPx, container.scrollHeight);

    // If the break falls inside an avoid-break block, push the whole block to next page
    const containing = findBlockContainingY(avoidBlocks, targetBreakDom);
    if (containing) {
      const proposedBreak = containing.topDomPx;
      // Only move break backward if we still leave reasonable content on the current page
      if (proposedBreak - yDom >= minSliceDomPx) {
        targetBreakDom = proposedBreak;
      }
      // else: the block starts too close to current y; we keep the break (block may split)
    }

    // Convert DOM slice → canvas slice
    const yCanvas = Math.floor(yDom * canvasPxPerDomPx);
    const breakCanvas = Math.floor(targetBreakDom * canvasPxPerDomPx);
    const sliceHeightPx = Math.min(sourceHeightPx - yCanvas, Math.max(1, breakCanvas - yCanvas));

    scratch.height = sliceHeightPx;

    // White background to avoid transparency issues
    scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
    scratchCtx.fillStyle = '#ffffff';
    scratchCtx.fillRect(0, 0, scratch.width, scratch.height);

    scratchCtx.drawImage(canvas, 0, yCanvas, sourceWidthPx, sliceHeightPx, 0, 0, sourceWidthPx, sliceHeightPx);

    const imgData = scratch.toDataURL('image/png');
    const sliceHeightMm = (sliceHeightPx * availableWidthMm) / sourceWidthPx;

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin, availableWidthMm, sliceHeightMm);

    pageIndex += 1;
    yDom = targetBreakDom;

    // Safety: if we didn't advance, force-advance by one page
    if (sliceHeightPx <= 1 && remainingDom > 0) {
      yDom += pageHeightDomPx;
    }
  }

  pdf.save(`${opts.filename}.pdf`);
}
