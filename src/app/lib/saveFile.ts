/**
 * Guarda um ficheiro gerado no app (CSV de leads, modelo de importação, relatórios).
 *
 * No browser: download normal. No app Android: o WebView ignora <a download>, por isso
 * o ficheiro vai pelo plugin nativo FileSaver (android/.../FileSaverPlugin.java) para a
 * pasta Transferências, com um aviso "Abrir". APKs anteriores ao plugin (versionCode < 3)
 * pedem para atualizar a app.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { toast } from 'sonner';

const FileSaver = registerPlugin<{
  save(options: { filename: string; mimeType: string; data: string }): Promise<{ uri: string }>;
  open(options: { uri: string; mimeType: string }): Promise<void>;
}>('FileSaver');

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Descarrega um ficheiro do servidor (anexo de uma conversa) e guarda-o no aparelho, em vez
 * de o abrir numa aba do browser com o endereço da API à vista.
 */
export async function saveRemoteFile(url: string, filename?: string | null): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const fromUrl = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || '');
    const name = filename || fromUrl || 'ficheiro';
    return await saveFile(name, blob, blob.type || 'application/octet-stream');
  } catch {
    // Ficheiro de fora que não deixa ser lido aqui (CORS): abre como antes
    window.open(url, '_blank', 'noopener');
    return false;
  }
}

/** Devolve true quando o ficheiro ficou guardado (ou o download começou, no browser) */
export async function saveFile(filename: string, content: string | Blob, mimeType: string): Promise<boolean> {
  const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;

  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  if (!Capacitor.isPluginAvailable('FileSaver')) {
    toast.error('Atualize a app para guardar ficheiros no telemóvel.');
    return false;
  }

  try {
    const { uri } = await FileSaver.save({ filename, mimeType, data: await toBase64(blob) });
    toast.success(`${filename} guardado em Transferências`, {
      action: { label: 'Abrir', onClick: () => void FileSaver.open({ uri, mimeType }).catch(() => toast.error('Nenhuma aplicação para abrir este ficheiro')) },
    });
    return true;
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Não foi possível guardar o ficheiro');
    return false;
  }
}
