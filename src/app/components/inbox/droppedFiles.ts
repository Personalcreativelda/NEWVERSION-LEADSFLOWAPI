/** O arrasto traz ficheiros (e não texto ou um link selecionado)? */
export function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types || []).includes('Files');
}

/**
 * Ficheiros colados (Ctrl+V) ou largados na conversa, prontos para a fila de anexos.
 * Ao colar, se houver texto na área de transferência cola-se o texto: copiar do Word ou do
 * Excel traz também uma imagem desse texto e não a queremos enviar por engano.
 * Capturas de ecrã chegam como "image.png": passam a "imagem-AAAAMMDD-HHMMSS.png".
 */
export function filesFrom(dt: DataTransfer | null, { pasting = false } = {}): File[] {
  if (!dt) return [];
  if (pasting && dt.getData('text/plain').trim()) return [];
  const files = Array.from(dt.files || []);
  if (files.length === 0 && dt.items) {
    for (const item of Array.from(dt.items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
  }
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return files.map((f, i) => {
    const generic = !f.name || /^image\.(png|jpe?g|gif|webp)$/i.test(f.name);
    if (!generic) return f;
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    const name = `imagem-${stamp}${files.length > 1 ? `-${i + 1}` : ''}.${ext}`;
    return new File([f], name, { type: f.type, lastModified: Date.now() });
  });
}
