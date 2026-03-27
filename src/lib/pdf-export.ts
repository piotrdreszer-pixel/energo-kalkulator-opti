import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type PdfExportOptions = {
  filename: string;
  marginMm?: number;
  scale?: number;
  avoidBreakSelector?: string;
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

  blocks.sort((a, b) => a.topDomPx - b.topDomPx);

  const merged: AvoidBlock[] = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (!last || b.topDomPx > last.bottomDomPx) {
      merged.push(b);
    } else {
      last.bottomDomPx = Math.max(last.bottomDomPx, b.bottomDomPx);
    }
  }

  return merged;
}

function findBlockContainingY(blocks: AvoidBlock[], yDomPx: number) {
  return blocks.find((b) => yDomPx > b.topDomPx && yDomPx < b.bottomDomPx);
}

export async function exportElementToPdf(container: HTMLElement, opts: PdfExportOptions) {
  const margin = opts.marginMm ?? 10;
  const scale = opts.scale ?? 3;
  const avoidBreakSelector = opts.avoidBreakSelector ?? '.print-avoid-break';
  const minSliceDomPx = opts.minSliceDomPx ?? 180;

  const containerHeightDomPx = Math.max(
    container.scrollHeight,
    container.offsetHeight,
    container.getBoundingClientRect().height
  );

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
        clonedContainer.style.width = '210mm';
        clonedContainer.style.maxWidth = '210mm';
        clonedContainer.style.margin = '0';
        clonedContainer.style.padding = '0';
        clonedContainer.style.background = '#ffffff';
        clonedContainer.style.boxSizing = 'border-box';
      }
    },
  });

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

  const containerWidthDomPx = container.getBoundingClientRect().width || container.scrollWidth;
  const canvasPxPerDomPx = containerWidthDomPx > 0 ? canvas.width / containerWidthDomPx : scale;

  const pageHeightCanvasPx = Math.floor((canvas.width * availableHeightMm) / availableWidthMm);
  const pageHeightDomPx = pageHeightCanvasPx / canvasPxPerDomPx;

  const avoidBlocks = getAvoidBlocks(container, avoidBreakSelector);

  const sourceWidthPx = canvas.width;
  const sourceHeightPx = canvas.height;

  const scratch = document.createElement('canvas');
  const scratchCtx = scratch.getContext('2d');
  if (!scratchCtx) throw new Error('Nie udało się utworzyć kontekstu canvas dla PDF');

  scratch.width = sourceWidthPx;

  let yDom = 0;
  let pageIndex = 0;

  while (true) {
    const remainingDom = containerHeightDomPx - yDom;
    if (remainingDom <= 0) break;

    let targetBreakDom = Math.min(yDom + pageHeightDomPx, containerHeightDomPx);

    const containing = findBlockContainingY(avoidBlocks, targetBreakDom);
    if (containing) {
      const proposedBreak = containing.topDomPx;
      if (proposedBreak - yDom >= minSliceDomPx) {
        targetBreakDom = proposedBreak;
      }
    }

    const yCanvas = Math.floor(yDom * canvasPxPerDomPx);
    const breakCanvas = Math.floor(targetBreakDom * canvasPxPerDomPx);
    const sliceHeightPx = Math.min(sourceHeightPx - yCanvas, Math.max(1, breakCanvas - yCanvas));

    scratch.height = sliceHeightPx;

    scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
    scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
    scratchCtx.fillStyle = '#ffffff';
    scratchCtx.fillRect(0, 0, scratch.width, scratch.height);

    scratchCtx.drawImage(
      canvas,
      0,
      yCanvas,
      sourceWidthPx,
      sliceHeightPx,
      0,
      0,
      sourceWidthPx,
      sliceHeightPx
    );

    const imgData = scratch.toDataURL('image/jpeg', 0.85);
    const sliceHeightMm = (sliceHeightPx * availableWidthMm) / sourceWidthPx;

    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, margin, availableWidthMm, sliceHeightMm);

    pageIndex += 1;
    yDom = targetBreakDom;

    if (sliceHeightPx <= 1 && remainingDom > 0) {
      yDom += pageHeightDomPx;
    }
  }

  pdf.save(`${opts.filename}.pdf`);
}
