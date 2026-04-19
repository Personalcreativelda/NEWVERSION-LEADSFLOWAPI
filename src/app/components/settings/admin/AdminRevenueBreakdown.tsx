import React from 'react';
import { Rocket, Crown, DollarSign } from 'lucide-react';

interface RevenueData {
  totalMRR: number;
  totalARR: number;
  businessMRR: number;
  enterpriseMRR: number;
  businessARR: number;
  enterpriseARR: number;
  businessMonthlyCount: number;
  businessAnnualCount: number;
  enterpriseMonthlyCount: number;
  enterpriseAnnualCount: number;
}

interface PlanPricing {
  id: string;
  name: string;
  price: { monthly: number; annual: number };
}

interface AdminRevenueBreakdownProps {
  revenue: RevenueData;
  plansPricing?: PlanPricing[];
}

export const AdminRevenueBreakdown: React.FC<AdminRevenueBreakdownProps> = ({ revenue, plansPricing = [] }) => {
  const businessPlan = plansPricing.find(p => p.id === 'business');
  const enterprisePlan = plansPricing.find(p => p.id === 'enterprise');
  const bMonthlyPrice = businessPlan?.price?.monthly || 0;
  const bAnnualPrice = businessPlan?.price?.annual || 0;
  const eMonthlyPrice = enterprisePlan?.price?.monthly || 0;
  const eAnnualPrice = enterprisePlan?.price?.annual || 0;
  const cardClass = "rounded-2xl border border-border bg-card shadow-sm overflow-hidden";
  const mutedTextClass = "text-sm text-muted-foreground";
  const tinyMutedTextClass = "text-[10px] text-muted-foreground/70";
  const revenueHighlightClass = "p-5 rounded-2xl border border-green-200 dark:border-green-900/30 bg-gradient-to-br from-green-50 dark:from-green-900/10 to-transparent shadow-sm relative overflow-hidden";

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-foreground mb-4">Detalhamento de Faturamento</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Plan Revenue */}
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
              <Rocket className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Plano Business</h3>
              <p className={mutedTextClass}>Receita mensal e anual</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <p className={mutedTextClass}>Assinantes Mensais</p>
                <p className={tinyMutedTextClass}>${bMonthlyPrice}/mês cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.businessMonthlyCount} usuários</p>
                <p className="text-sm text-blue-600 dark:text-blue-400">${revenue.businessMonthlyCount * bMonthlyPrice}/mês</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <p className={mutedTextClass}>Assinantes Anuais</p>
                <p className={tinyMutedTextClass}>${bAnnualPrice}/ano cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.businessAnnualCount} usuários</p>
                <p className="text-sm text-blue-600 dark:text-blue-400">${revenue.businessAnnualCount * bAnnualPrice}/ano</p>
              </div>
            </div>
            
            <div className="rounded-lg border border-blue-200 dark:border-blue-900/30 bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-foreground">MRR Business</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">${revenue.businessMRR.toFixed(2)}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">ARR Business</p>
                <p className="text-xl font-bold text-blue-600 dark:text-blue-400">${revenue.businessARR.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Enterprise Plan Revenue */}
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
              <Crown className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-bold text-foreground">Plano Enterprise</h3>
              <p className={mutedTextClass}>Receita mensal e anual</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <p className={mutedTextClass}>Assinantes Mensais</p>
                <p className={tinyMutedTextClass}>${eMonthlyPrice}/mês cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.enterpriseMonthlyCount} usuários</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">${revenue.enterpriseMonthlyCount * eMonthlyPrice}/mês</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <p className={mutedTextClass}>Assinantes Anuais</p>
                <p className={tinyMutedTextClass}>${eAnnualPrice}/ano cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.enterpriseAnnualCount} usuários</p>
                <p className="text-sm text-purple-600 dark:text-purple-400">${revenue.enterpriseAnnualCount * eAnnualPrice}/ano</p>
              </div>
            </div>
            
            <div className="rounded-lg border border-purple-200 dark:border-purple-900/30 bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-foreground">MRR Enterprise</p>
                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">${revenue.enterpriseMRR.toFixed(2)}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">ARR Enterprise</p>
                <p className="text-xl font-bold text-purple-600 dark:text-purple-400">${revenue.enterpriseARR.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Total Revenue Summary */}
      <div className={`${revenueHighlightClass} mt-6 p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
            <DollarSign className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Faturamento Total</h3>
            <p className={mutedTextClass}>Receita recorrente de todos os planos pagos ativos</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`${cardClass} border-green-200 dark:border-green-900/30 p-4`}>
            <p className={`${mutedTextClass} mb-1`}>Receita Mensal Recorrente (MRR)</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">${revenue.totalMRR.toFixed(2)}</p>
            <p className={`${tinyMutedTextClass} mt-1`}>
              {revenue.businessMonthlyCount + revenue.enterpriseMonthlyCount} assinantes mensais + 
              {' '}{revenue.businessAnnualCount + revenue.enterpriseAnnualCount} anuais (convertido)
            </p>
          </div>
          
          <div className={`${cardClass} border-green-200 dark:border-green-900/30 p-4`}>
            <p className={`${mutedTextClass} mb-1`}>Receita Anual Recorrente (ARR)</p>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">${revenue.totalARR.toFixed(2)}</p>
            <p className={`${tinyMutedTextClass} mt-1`}>
              Projeção anual baseada em todos os assinantes ativos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
