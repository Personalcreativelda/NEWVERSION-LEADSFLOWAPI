/**
 * Converte um documento HTML (ex.: o relatório) num PDF A4, sem abrir janelas: o HTML é
 * desenhado num iframe escondido (estilos isolados do app), capturado com html2canvas e
 * partido em páginas pelo jsPDF. Abrir uma janela para imprimir prendia o app Android
 * (o WebView navegava para o relatório e não havia como voltar).
 */
const PAGE_WIDTH_PX = 800;

export async function htmlToPdf(html: string): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas')]);

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_WIDTH_PX}px;height:10px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument!;
    doc.open();
    // Folha branca, sem a margem cinzenta pensada para o ecrã
    doc.write(html.replace('</head>', '<style>body{background:#fff!important;padding:24px!important}.container{box-shadow:none!important;padding:0!important}</style></head>'));
    doc.close();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await doc.fonts?.ready;
    iframe.style.height = `${doc.documentElement.scrollHeight}px`;

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: PAGE_WIDTH_PX,
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;
    const image = canvas.toDataURL('image/jpeg', 0.92);

    // Mesma imagem em cada página, deslocada para cima (paginação simples)
    for (let offset = 0; offset < imgHeight; offset += pageHeight) {
      if (offset > 0) pdf.addPage();
      pdf.addImage(image, 'JPEG', 0, -offset, pageWidth, imgHeight);
    }
    return pdf.output('blob');
  } finally {
    iframe.remove();
  }
}
