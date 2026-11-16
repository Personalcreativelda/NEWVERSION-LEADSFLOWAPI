import { useState } from 'react';
import { Check, CheckCircle2, Clock, Copy, XCircle } from 'lucide-react';
import { apiRequest } from '../../utils/api';
import { formatMoney } from '../../utils/format';
import { checkTxInput, MOBILE_METHOD_LABEL, TX_EXAMPLES, type MobileMethod } from '../../utils/mobileMoney';

/**
 * Pagamento do plano por M-Pesa / e-Mola ao comerciante (sem fornecedor de pagamentos):
 *  1. instruções (USSD, código do comerciante, nome, valor);
 *  2. o cliente escreve o código da transação (ou cola a SMS);
 *  3. a API confirma sozinha quando a SMS do comerciante chega com o mesmo código,
 *     senão o administrador confirma em Admin → Pagamentos.
 * Ver api/src/services/mobile-payments.service.ts.
 */
export interface MobileMethodPublic {
  id: MobileMethod;
  label: string;
  merchantCode: string;
  merchantName: string;
  ussd: string;
  logoUrl?: string;
}

export interface MobilePaymentRecord {
  id: string;
  plan_id: string;
  billing_cycle: 'monthly' | 'annual';
  method: MobileMethod;
  amount: number | string;
  transaction_id: string;
  status: 'pending' | 'paid' | 'rejected';
  rejected_reason?: string | null;
}

export const MOBILE_PAY_FORM_ID = 'mobile-pay-form';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1800);
        } catch { /* sem área de transferência */ }
      }}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
      aria-label={label}
    >
      {done ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

/** Estado de um pagamento já enviado (a confirmar ou pago). */
export function MobilePaymentStatus({ payment }: { payment: MobilePaymentRecord }) {
  const label = MOBILE_METHOD_LABEL[payment.method] || payment.method;
  if (payment.status === 'paid') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border p-4">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <p className="font-medium text-foreground">Pagamento confirmado</p>
          <p className="text-sm text-muted-foreground">O plano já está ativo.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border p-4">
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">A confirmar pagamento</p>
        <p className="text-sm text-muted-foreground">
          {label} · <span className="font-mono" translate="no">{payment.transaction_id}</span>
        </p>
      </div>
    </div>
  );
}

interface Props {
  method: MobileMethodPublic;
  planId: string;
  billingCycle: 'monthly' | 'annual';
  amount: number;
  rejectedReason?: string | null;
  onSendingChange?: (sending: boolean) => void;
  onValidChange?: (valid: boolean) => void;
  onSubmitted: (payment: MobilePaymentRecord, paid: boolean) => void;
}

/** Instruções + formulário. O botão de enviar fica no rodapé do modal (form={MOBILE_PAY_FORM_ID}). */
export function MobileMoneyCheckout({ method, planId, billingCycle, amount, rejectedReason, onSendingChange, onValidChange, onSubmitted }: Props) {
  const [input, setInput] = useState('');
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const check = checkTxInput(input, method.id);
  const example = TX_EXAMPLES[method.id];

  const setValue = (v: string) => {
    setInput(v);
    setError('');
    onValidChange?.(checkTxInput(v, method.id).ok);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!check.ok || sending) {
      if (!check.ok) setError(check.error || 'Escreva o código da transação ou cole a SMS de confirmação.');
      return;
    }
    setSending(true);
    onSendingChange?.(true);
    setError('');
    try {
      const res = await apiRequest('/payments/mobile', 'POST', {
        planId,
        billingCycle,
        method: method.id,
        transactionId: check.code,
        ...(check.isSms ? { proofText: input.trim() } : {}),
      });
      onSubmitted(res.payment, !!res.paid);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível enviar. Tente novamente.');
    } finally {
      setSending(false);
      onSendingChange?.(false);
    }
  };

  const ussdHref = `tel:${method.ussd.replace(/#/g, '%23')}`;

  return (
    <div className="space-y-4">
      {rejectedReason && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border p-3">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-foreground">Não confirmámos o pagamento anterior: {rejectedReason}.</p>
        </div>
      )}

      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        <li>
          Marque <a href={ussdHref} className="font-mono font-semibold text-foreground underline-offset-2 hover:underline" translate="no">{method.ussd}</a> e escolha <span className="text-foreground">Pagar ao comerciante</span>.
        </li>
        <li>Use o código e o valor abaixo.</li>
        <li>Escreva aqui o código da transação da SMS de confirmação.</li>
      </ol>

      <dl className="divide-y divide-border rounded-xl border border-border">
        <div className="flex items-center justify-between gap-2 py-1.5 pl-3 pr-1">
          <dt className="text-sm text-muted-foreground">Código do comerciante</dt>
          <dd className="flex items-center gap-1">
            <span className="font-mono text-lg font-bold tracking-wider text-foreground" translate="no">{method.merchantCode}</span>
            <CopyButton value={method.merchantCode} label="Copiar código do comerciante" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <dt className="text-sm text-muted-foreground">Nome</dt>
          <dd className="min-w-0 truncate text-right font-medium text-foreground" translate="no">{method.merchantName}</dd>
        </div>
        <div className="flex items-center justify-between gap-2 py-1.5 pl-3 pr-1">
          <dt className="text-sm text-muted-foreground">Valor</dt>
          <dd className="flex items-center gap-1">
            <span className="font-semibold tabular-nums text-foreground">{formatMoney(amount, 'MZN')}</span>
            <CopyButton value={amount.toFixed(2)} label="Copiar valor" />
          </dd>
        </div>
      </dl>

      <form id={MOBILE_PAY_FORM_ID} onSubmit={submit} className="space-y-2">
        <label htmlFor="mobile-pay-code" className="block text-sm font-medium text-foreground">Código da transação</label>
        <textarea
          id="mobile-pay-code"
          value={input}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          rows={2}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={600}
          aria-invalid={touched && !check.ok && !!check.error}
          aria-describedby="mobile-pay-hint"
          placeholder={`Ex.: ${example} — ou cole a SMS`}
          className="w-full resize-none px-3 py-2.5 font-mono placeholder:font-sans"
        />
        <p id="mobile-pay-hint" className="text-xs" aria-live="polite">
          {check.ok ? (
            <span className="inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              {check.isSms ? 'Código encontrado na SMS: ' : 'Código válido: '}
              <span className="font-mono" translate="no">{check.code}</span>
            </span>
          ) : touched && check.error ? (
            <span className="text-red-600 dark:text-red-400">{check.error}</span>
          ) : (
            <span className="text-muted-foreground">Formato: <span className="font-mono" translate="no">{example}</span></span>
          )}
        </p>
        {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
      </form>
    </div>
  );
}
