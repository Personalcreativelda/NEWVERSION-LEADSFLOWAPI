// Perfil (foto + nome + email) e a folha "Tirar foto / Escolher da galeria".
import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { AppModal } from '../base/AppModal';
import { isNativeApp } from '../../../native';
import { getApiBaseUrl } from '../../utils/api-client';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function initials(name?: string) {
  const words = (name || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return words.length ? (words[0][0] + (words[1]?.[0] || '')).toUpperCase() : '';
}

async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type.split('/')[1] || 'jpeg';
  return new File([blob], `${name}.${ext}`, { type: blob.type || 'image/jpeg' });
}

/** Foto pela câmara/galeria do telemóvel (plugin) ou por ficheiro no browser */
export function PhotoSourceSheet({ open, onClose, onPicked }: {
  open: boolean;
  onClose: () => void;
  onPicked: (file: File) => void;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const pick = async (source: 'camera' | 'gallery') => {
    if (!isNativeApp()) {
      (source === 'camera' ? cameraInput : galleryInput).current?.click();
      return;
    }
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await CapCamera.getPhoto({
        source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.DataUrl,
        quality: 80,
        width: 800,
        correctOrientation: true,
      });
      onClose();
      if (photo.dataUrl) onPicked(await dataUrlToFile(photo.dataUrl, 'avatar'));
    } catch (err: any) {
      // Cancelar na câmara/galeria não é erro
      if (!/cancel/i.test(err?.message || '')) toast.error('Não foi possível obter a foto');
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onClose();
    onPicked(file);
  };

  return (
    <AppModal open={open} onOpenChange={(o) => !o && onClose()} size="sm" title="Foto de perfil">
      <div className="-mx-1 space-y-1">
        <button type="button" onClick={() => pick('camera')} className="flex w-full min-h-[52px] items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground hover:bg-muted active:bg-muted">
          <Camera className="h-5 w-5 text-muted-foreground" />
          Tirar foto
        </button>
        <button type="button" onClick={() => pick('gallery')} className="flex w-full min-h-[52px] items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground hover:bg-muted active:bg-muted">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          Escolher da galeria
        </button>
      </div>
      <input ref={cameraInput} type="file" accept="image/*" capture="user" className="hidden" onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </AppModal>
  );
}

/** Perfil: foto no topo, nome e email; Guardar só fica ativo quando há alterações */
export function ProfileSection({ user, onUpdateUser }: { user: any; onUpdateUser: (u: any) => void }) {
  const [name, setName] = useState(user?.name || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(user?.name || ''); }, [user?.name]);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  const nameChanged = name.trim() !== (user?.name || '').trim();
  const dirty = !!avatarFile || nameChanged;

  const onPicked = (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error('Escolha uma imagem'); return; }
    if (file.size > MAX_AVATAR_BYTES) { toast.error('A imagem tem de ter menos de 2 MB'); return; }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const save = async () => {
    if (!name.trim()) { toast.error('O nome não pode ficar vazio'); return; }
    setSaving(true);
    const token = localStorage.getItem('leadflow_access_token');
    const base = getApiBaseUrl();
    let next = { ...user };
    try {
      if (avatarFile) {
        const form = new FormData();
        form.append('avatar', avatarFile);
        const res = await fetch(`${base}/api/users/avatar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.details || 'Não foi possível enviar a foto');
        }
        const data = await res.json();
        next = { ...next, ...(data.user || data) };
      }
      if (nameChanged) {
        const res = await fetch(`${base}/api/users/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) throw new Error('Não foi possível guardar o nome');
        next = { ...next, ...(await res.json()) };
      }
      onUpdateUser(next);
      setAvatarFile(null);
      setAvatarPreview(null);
      toast.success('Perfil guardado');
    } catch (err: any) {
      toast.error(err?.message || 'Não foi possível guardar o perfil');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-2">
        <button type="button" onClick={() => setSheetOpen(true)} className="relative rounded-full" aria-label="Alterar foto de perfil">
          <Avatar key={avatarPreview || user?.avatar_url || 'none'} className="h-24 w-24">
            <AvatarImage src={avatarPreview || user?.avatar_url || undefined} alt="" />
            <AvatarFallback className="bg-primary text-2xl font-semibold text-primary-foreground">
              {initials(user?.name) || <User className="h-10 w-10" />}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
            <Camera className="h-4 w-4" />
          </span>
        </button>
        <button type="button" onClick={() => setSheetOpen(true)} className="text-sm font-medium text-primary">
          Alterar foto
        </button>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <Label htmlFor="profile-name">Nome</Label>
          <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="O seu nome" className="mt-1.5 h-11" />
        </div>
        <div>
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={user?.email || ''} readOnly disabled className="mt-1.5 h-11" />
        </div>
      </div>

      <Button onClick={save} disabled={!dirty || saving} className="w-full sm:w-auto">
        {saving ? <><Loader2 className="h-4 w-4 animate-spin" />A guardar…</> : 'Guardar'}
      </Button>

      <PhotoSourceSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onPicked={onPicked} />
    </div>
  );
}
