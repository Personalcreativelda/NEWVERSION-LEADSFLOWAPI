import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { plansApi } from '../utils/api';
import { getAppDistribution } from '../../live-update';

export interface GooglePlayProductConfig {
  planId: 'business' | 'enterprise';
  billingCycle: 'monthly' | 'annual';
  productId: string;
  basePlanId: string;
}

export interface GooglePlayConfig {
  enabled: boolean;
  accountId: string | null;
  products: GooglePlayProductConfig[];
}

type BillingModule = typeof import('capacitor-plugin-cdv-purchase');

export const GOOGLE_PLAY_BILLING_EVENT = 'leadsflow-google-play-billing';

let initPromise: Promise<GooglePlayConfig> | null = null;
let billingModule: BillingModule | null = null;
let resumeListenerAdded = false;
let storeListenersAdded = false;

function emit(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(GOOGLE_PLAY_BILLING_EVENT, { detail }));
}

/** O utilizador fechou o checkout da Google: não é um erro, não se mostra nada. */
function isCancelled(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false;
  if (billingModule && error.code === billingModule.ErrorCode.PAYMENT_CANCELLED) return true;
  return /cancel/i.test(String(error.message || ''));
}

function errorMessage(error: unknown, fallback = 'Não foi possível concluir a compra na Google Play.') {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim();
    if (message) return message;
  }
  return fallback;
}

/**
 * Inicia a loja apenas no APK publicado pela Google Play. A importação dinâmica
 * impede que o checkout nativo entre no caminho normal da web.
 */
export async function initGooglePlayBilling(): Promise<GooglePlayConfig> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const distribution = await getAppDistribution();
    if (distribution !== 'play') {
      return { enabled: false, accountId: null, products: [] };
    }

    if (import.meta.env.DEV && !Capacitor.isNativePlatform()) {
      return {
        enabled: true,
        accountId: 'previsualizacao-local',
        products: [
          { planId: 'business', billingCycle: 'monthly', productId: 'leadsflow_business', basePlanId: 'monthly' },
          { planId: 'business', billingCycle: 'annual', productId: 'leadsflow_business', basePlanId: 'annual' },
          { planId: 'enterprise', billingCycle: 'monthly', productId: 'leadsflow_enterprise', basePlanId: 'monthly' },
          { planId: 'enterprise', billingCycle: 'annual', productId: 'leadsflow_enterprise', basePlanId: 'annual' },
        ],
      } satisfies GooglePlayConfig;
    }

    const config = await plansApi.getGooglePlayConfig() as GooglePlayConfig & { success?: boolean };
    if (!config.enabled || !config.accountId || !config.products?.length) return config;

    // No browser local mostramos o estado visual, mas nunca iniciamos uma compra.
    if (!Capacitor.isNativePlatform()) return config;

    const module = await import('capacitor-plugin-cdv-purchase');
    billingModule = module;
    const { store, ProductType, Platform } = module;

    store.applicationUsername = config.accountId;
    // O identificador recebido da API já é um HMAC opaco e estável.
    store.obfuscator = 'disabled';

    const uniqueProducts = [...new Set(config.products.map((product) => product.productId))];
    store.register(uniqueProducts.map((id) => ({
      id,
      type: ProductType.PAID_SUBSCRIPTION,
      platform: Platform.GOOGLE_PLAY,
    })));

    if (!storeListenersAdded) {
      storeListenersAdded = true;
      store.when()
        .approved(async (transaction) => {
          const receipt = transaction.parentReceipt as { purchaseToken?: string };
          const purchaseToken = receipt.purchaseToken;
          const productId = transaction.products[0]?.id;
          if (!purchaseToken || !productId) {
            emit({ type: 'error', message: 'A Google Play não devolveu um comprovativo válido.' });
            return;
          }

          try {
            const result = await plansApi.verifyGooglePlayPurchase(purchaseToken, productId);
            if (!result?.verified) throw new Error('A compra ainda não foi confirmada.');
            await transaction.finish();
            emit({ type: 'verified', productId, result });
          } catch (error) {
            // Sem finish(): a Google volta a entregar a compra para ser confirmada.
            emit({ type: 'error', productId, message: errorMessage(error) });
          }
        })
        .pending((transaction) => {
          emit({ type: 'pending', productId: transaction.products[0]?.id });
        });

      store.error((error) => {
        if (isCancelled(error)) return;
        emit({ type: 'error', code: error.code, message: error.message });
      });
    }

    const errors = await store.initialize([Platform.GOOGLE_PLAY]);
    if (errors.length) throw new Error(errors[0]?.message || 'A Google Play não está disponível.');

    if (!resumeListenerAdded) {
      resumeListenerAdded = true;
      await App.addListener('resume', () => {
        void store.restorePurchases().catch(() => {});
      });
    }

    return config;
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

/** Abre o checkout da Google. Devolve 'cancelled' se o utilizador o fechar sem comprar. */
export async function purchaseGooglePlay(
  planId: string,
  billingCycle: 'monthly' | 'annual',
): Promise<'started' | 'cancelled'> {
  const config = await initGooglePlayBilling();
  if (!config.enabled) throw new Error('Os pagamentos Google Play ainda não estão configurados.');
  if (!Capacitor.isNativePlatform()) throw new Error('A compra só pode ser concluída na aplicação Android.');
  if (!billingModule) throw new Error('A Google Play não está disponível neste dispositivo.');

  const selected = config.products.find((product) =>
    product.planId === planId && product.billingCycle === billingCycle,
  );
  if (!selected) {
    // Diagnóstico temporário: o que a API enviou ao app
    const sent = config.products.map((p) => `${p.planId}/${p.billingCycle}`).join(', ') || 'nenhum';
    throw new Error(`Este plano não está disponível na Google Play. [${planId}/${billingCycle} · API: ${sent}]`);
  }

  const { store, Platform } = billingModule;
  const offerId = `${selected.productId}@${selected.basePlanId}`;
  const findOffer = () => {
    const offers = store.get(selected.productId, Platform.GOOGLE_PLAY)?.offers || [];
    // O plano base sem oferta extra; se só houver ofertas (ex.: período grátis), serve a primeira desse plano base.
    return offers.find((candidate) => candidate.id === offerId)
      || offers.find((candidate) => candidate.id.startsWith(`${offerId}@`));
  };
  let offer = findOffer();
  if (!offer) {
    // A lista é pedida à Google ao abrir o app: um plano ativado depois só aparece se a pedirmos de novo.
    await store.update();
    offer = findOffer();
  }
  if (!offer) {
    // Diagnóstico temporário: o que a Google devolveu para este produto
    const product = store.get(selected.productId, Platform.GOOGLE_PLAY);
    const got = product ? (product.offers.map((o) => o.id).join(', ') || 'sem planos') : 'produto não devolvido';
    const registered = store.products.map((p) => p.id).join(', ') || 'nenhum';
    throw new Error(`Este plano ainda não está disponível na Google Play. [${offerId} · Google: ${got} · registados: ${registered}]`);
  }

  const orderError = await offer.order({ applicationUsername: config.accountId || undefined });
  if (orderError) {
    if (isCancelled(orderError)) return 'cancelled';
    throw new Error(orderError.message || 'A compra não foi concluída.');
  }
  return 'started';
}

export async function restoreGooglePlayPurchases() {
  await initGooglePlayBilling();
  if (!billingModule) throw new Error('A Google Play não está disponível neste dispositivo.');
  const error = await billingModule.store.restorePurchases();
  if (error) throw new Error(error.message || 'Não foi possível restaurar as compras.');
}

export async function manageGooglePlaySubscriptions() {
  await initGooglePlayBilling();
  if (!billingModule) throw new Error('A Google Play não está disponível neste dispositivo.');
  const error = await billingModule.store.manageSubscriptions(billingModule.Platform.GOOGLE_PLAY);
  if (error) throw new Error(error.message || 'Não foi possível abrir as subscrições da Google Play.');
}
