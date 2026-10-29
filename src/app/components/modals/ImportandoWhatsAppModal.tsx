import { Loader2 } from 'lucide-react';
import { OverlayModal } from '../base/OverlayModal';
import { LogoBox } from '../base/LogoBox';

interface ImportandoWhatsAppModalProps {
  isOpen: boolean;
}

/** Enquanto a API pede os contactos ao WhatsApp e confirma os números */
export default function ImportandoWhatsAppModal({ isOpen }: ImportandoWhatsAppModalProps) {
  if (!isOpen) return null;

  return (
    <OverlayModal onClose={() => {}} stickyEdges={false} className="p-8 max-w-sm">
      <div className="flex flex-col items-center text-center gap-4">
        <LogoBox brand="whatsapp" className="h-14 w-14 rounded-2xl [&>svg]:h-9 [&>svg]:w-9" />
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-foreground">A procurar contactos no WhatsApp</h3>
          <p className="text-sm text-muted-foreground">Pode demorar alguns segundos</p>
        </div>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </OverlayModal>
  );
}
