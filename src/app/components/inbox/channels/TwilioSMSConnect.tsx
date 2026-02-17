// INBOX: Modal de Configuração Twilio SMS
import React, { useState } from 'react';
import { channelsApi } from '../../../services/api/inbox';
import { toast } from 'sonner';
import { Smartphone, AlertCircle, CheckCircle, ExternalLink, Loader2, Eye, EyeOff } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Alert, AlertDescription } from '../../ui/alert';

interface TwilioSMSConnectProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function TwilioSMSConnect({ isOpen, onClose, onSuccess }: TwilioSMSConnectProps) {
    const [formData, setFormData] = useState({
        name: 'Meu SMS Twilio',
        accountSid: '',
        authToken: '',
        phoneNumber: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAuthToken, setShowAuthToken] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleClose = () => {
        if (!loading) {
            setFormData({
                name: 'Meu SMS Twilio',
                accountSid: '',
                authToken: '',
                phoneNumber: ''
            });
            setError(null);
            setSuccess(false);
            setShowAuthToken(false);
            onClose();
        }
    };

    const validateE164 = (phone: string): boolean => {
        // E.164 format: +[country code][number]
        const e164Regex = /^\+[1-9]\d{10,14}$/;
        return e164Regex.test(phone);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validações
        if (!formData.name.trim()) {
            setError('Digite um nome para o canal');
            return;
        }

        if (!formData.accountSid.trim() || !formData.accountSid.startsWith('AC')) {
            setError('Account SID inválido. Deve começar com "AC"');
            return;
        }

        if (!formData.authToken.trim()) {
            setError('Digite o Auth Token');
            return;
        }

        if (!formData.phoneNumber.trim()) {
            setError('Digite o número de telefone Twilio');
            return;
        }

        if (!validateE164(formData.phoneNumber)) {
            setError('Número inválido. Use formato E.164 (ex: +5511999887766)');
            return;
        }

        setLoading(true);

        try {
            await channelsApi.create({
                type: 'twilio_sms',
                name: formData.name,
                status: 'active',
                credentials: {
                    accountSid: formData.accountSid,
                    authToken: formData.authToken,
                    phoneNumber: formData.phoneNumber
                }
            });

            setSuccess(true);
            toast.success('Canal SMS criado com sucesso!');
            
            setTimeout(() => {
                handleClose();
                onSuccess();
            }, 2000);
        } catch (err: any) {
            console.error('[TwilioSMS] Error creating channel:', err);
            setError(err.response?.data?.error || 'Erro ao criar canal SMS. Verifique as credenciais.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <div className="bg-teal-100 dark:bg-teal-900/30 p-2 rounded-lg">
                            <Smartphone className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                        </div>
                        Configurar Twilio SMS
                    </DialogTitle>
                    <DialogDescription>
                        Configure suas credenciais Twilio para enviar e receber SMS
                    </DialogDescription>
                </DialogHeader>

                {success ? (
                    <div className="py-8 text-center space-y-4">
                        <div className="flex justify-center">
                            <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-full">
                                <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-foreground mb-2">
                                Canal SMS Configurado!
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Agora configure o webhook no Twilio Console...
                            </p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Nome do Canal */}
                        <div className="space-y-2">
                            <Label htmlFor="channelName">Nome do Canal</Label>
                            <Input
                                id="channelName"
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ex: Meu SMS Twilio"
                                disabled={loading}
                            />
                        </div>

                        {/* Account SID */}
                        <div className="space-y-2">
                            <Label htmlFor="accountSid" className="flex items-center justify-between">
                                <span>Twilio Account SID</span>
                                <a 
                                    href="https://console.twilio.com" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                >
                                    Abrir Twilio Console
                                    <ExternalLink className="w-3 h-3" />
                                </a>
                            </Label>
                            <Input
                                id="accountSid"
                                type="text"
                                value={formData.accountSid}
                                onChange={(e) => setFormData({ ...formData, accountSid: e.target.value })}
                                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                className="font-mono text-sm"
                                disabled={loading}
                            />
                            <p className="text-xs text-muted-foreground">
                                Encontre no dashboard do Twilio Console
                            </p>
                        </div>

                        {/* Auth Token */}
                        <div className="space-y-2">
                            <Label htmlFor="authToken">Auth Token</Label>
                            <div className="relative">
                                <Input
                                    id="authToken"
                                    type={showAuthToken ? "text" : "password"}
                                    value={formData.authToken}
                                    onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                                    placeholder="********************************"
                                    className="font-mono text-sm pr-10"
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowAuthToken(!showAuthToken)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showAuthToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Seu token de autenticação (mantido em segurança)
                            </p>
                        </div>

                        {/* Phone Number */}
                        <div className="space-y-2">
                            <Label htmlFor="phoneNumber">Número Twilio (E.164)</Label>
                            <Input
                                id="phoneNumber"
                                type="tel"
                                value={formData.phoneNumber}
                                onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                                placeholder="+5511999887766"
                                className="font-mono text-sm"
                                disabled={loading}
                            />
                            <p className="text-xs text-muted-foreground">
                                Formato: +[código país][número] - Ex: +5511999887766
                            </p>
                        </div>

                        {/* Erro */}
                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="w-4 h-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Instruções de Webhook */}
                        <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
                            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <AlertDescription className="text-xs sm:text-sm text-blue-900 dark:text-blue-100">
                                <strong className="block mb-2">📋 Após criar o canal:</strong>
                                <ol className="list-decimal list-inside space-y-1 text-[10px] sm:text-xs break-words">
                                    <li>Vá para <a href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming" target="_blank" className="underline">Phone Numbers</a> no Twilio</li>
                                    <li>Clique no número que você configurou acima</li>
                                    <li>Em "Messaging Configuration", configure:</li>
                                    <li className="ml-4">
                                        <strong>Webhook URL:</strong>
                                        <code className="block bg-white dark:bg-gray-900 p-1 rounded mt-1 text-[10px] sm:text-xs break-all">
                                            {window.location.origin}/api/webhooks/twilio/sms
                                        </code>
                                    </li>
                                    <li className="ml-4"><strong>Method:</strong> POST</li>
                                    <li>Clique em "Save Configuration"</li>
                                </ol>
                            </AlertDescription>
                        </Alert>

                        {/* Botões */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handleClose}
                                disabled={loading}
                                className="flex-1 w-full sm:w-auto"
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="submit"
                                disabled={loading}
                                className="flex-1 w-full sm:w-auto bg-teal-600 hover:bg-teal-700"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Criando Canal...
                                    </>
                                ) : (
                                    <>
                                        <Smartphone className="w-4 h-4 mr-2" />
                                        Criar Canal SMS
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                )}
            </DialogContent>
        </Dialog>
    );
}
