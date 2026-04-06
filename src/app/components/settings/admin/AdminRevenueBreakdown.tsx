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

interface AdminRevenueBreakdownProps {
  revenue: RevenueData;
}

export const AdminRevenueBreakdown: React.FC<AdminRevenueBreakdownProps> = ({ revenue }) => {
  const cardClass = "rounded-2xl border border-border bg-card shadow-sm overflow-hidden";
  const mutedTextClass = "text-sm text-muted-foreground";
  const tinyMutedTextClass = "text-[10px] text-muted-foreground/80";
  const revenueHighlightClass = "p-5 rounded-2xl border border-[hsl(var(--success)/0.35)] bg-gradient-to-br from-[hsl(var(--success)/0.03)] to-transparent shadow-sm relative overflow-hidden";

  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-foreground mb-4">Detalhamento de Faturamento</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Business Plan Revenue */}
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[hsl(var(--accent))]">
              <Rocket className="w-6 h-6 text-[hsl(var(--primary))]" />
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
                <p className={tinyMutedTextClass}>$20/mês cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.businessMonthlyCount} usuários</p>
                <p className="text-sm text-[hsl(var(--primary))]">${revenue.businessMonthlyCount * 20}/mês</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <p className={mutedTextClass}>Assinantes Anuais</p>
                <p className={tinyMutedTextClass}>$100/ano cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.businessAnnualCount} usuários</p>
                <p className="text-sm text-[hsl(var(--primary))]">${revenue.businessAnnualCount * 100}/ano</p>
              </div>
            </div>
            
            <div className="rounded-lg border border-[hsl(var(--accent))/0.35] bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-foreground">MRR Business</p>
                <p className="text-xl font-bold text-[hsl(var(--primary))]">${revenue.businessMRR.toFixed(2)}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">ARR Business</p>
                <p className="text-xl font-bold text-[hsl(var(--primary))]">${revenue.businessARR.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Enterprise Plan Revenue */}
        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[hsl(var(--purple)/0.2)]">
              <Crown className="w-6 h-6 text-[hsl(var(--primary))]" />
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
                <p className={tinyMutedTextClass}>$59/mês cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.enterpriseMonthlyCount} usuários</p>
                <p className="text-sm text-[hsl(var(--primary))]">${revenue.enterpriseMonthlyCount * 59}/mês</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div>
                <p className={mutedTextClass}>Assinantes Anuais</p>
                <p className={tinyMutedTextClass}>$200/ano cada</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-foreground">{revenue.enterpriseAnnualCount} usuários</p>
                <p className="text-sm text-[hsl(var(--primary))]">${revenue.enterpriseAnnualCount * 200}/ano</p>
              </div>
            </div>
            
            <div className="rounded-lg border border-[hsl(var(--purple))/0.35] bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-foreground">MRR Enterprise</p>
                <p className="text-xl font-bold text-[hsl(var(--primary))]">${revenue.enterpriseMRR.toFixed(2)}</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">ARR Enterprise</p>
                <p className="text-xl font-bold text-[hsl(var(--primary))]">${revenue.enterpriseARR.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Total Revenue Summary */}
      <div className={`${revenueHighlightClass} mt-6 p-6`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-[hsl(var(--success))/0.18] text-[hsl(var(--success))]">
            <DollarSign className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-foreground">Faturamento Total</h3>
            <p className={mutedTextClass}>Receita recorrente de todos os planos pagos ativos</p>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`${cardClass} border-[hsl(var(--success)/0.35)] p-4`}>
            <p className={`${mutedTextClass} mb-1`}>Receita Mensal Recorrente (MRR)</p>
            <p className="text-3xl font-bold text-[hsl(var(--success))]">${revenue.totalMRR.toFixed(2)}</p>
            <p className={`${tinyMutedTextClass} mt-1`}>
              {revenue.businessMonthlyCount + revenue.enterpriseMonthlyCount} assinantes mensais + 
              {' '}{revenue.businessAnnualCount + revenue.enterpriseAnnualCount} anuais (convertido)
            </p>
          </div>
          
          <div className={`${cardClass} border-[hsl(var(--success)/0.35)] p-4`}>
            <p className={`${mutedTextClass} mb-1`}>Receita Anual Recorrente (ARR)</p>
            <p className="text-3xl font-bold text-[hsl(var(--success))]">${revenue.totalARR.toFixed(2)}</p>
            <p className={`${tinyMutedTextClass} mt-1`}>
              Projeção anual baseada em todos os assinantes ativos
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
