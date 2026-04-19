import React from 'react';
import { Users, Rocket, Crown, DollarSign, TrendingUp } from 'lucide-react';

interface AdminStatsCardsProps {
  usersCount: number;
  freeCount: number;
  businessCount: number;
  enterpriseCount: number;
  totalMRR: number;
  totalARR: number;
}

export const AdminStatsCards: React.FC<AdminStatsCardsProps> = ({
  usersCount,
  freeCount,
  businessCount,
  enterpriseCount,
  totalMRR,
  totalARR,
}) => {
  const statCardClass = "p-5 rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-all duration-300";
  const mutedTextClass = "text-sm text-muted-foreground";
  const revenueHighlightClass = "p-5 rounded-2xl border border-green-200 dark:border-green-900/30 bg-gradient-to-br from-green-50 dark:from-green-900/10 to-transparent shadow-sm relative overflow-hidden";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      <div className={statCardClass}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className={mutedTextClass}>Total Usuários</p>
            <p className="text-2xl font-bold text-foreground">{usersCount}</p>
          </div>
        </div>
      </div>

      <div className={statCardClass}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted">
            <Users className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className={mutedTextClass}>Free</p>
            <p className="text-2xl font-bold text-foreground">{freeCount}</p>
          </div>
        </div>
      </div>

      <div className={statCardClass}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
            <Rocket className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className={mutedTextClass}>Business</p>
            <p className="text-2xl font-bold text-foreground">{businessCount}</p>
          </div>
        </div>
      </div>

      <div className={statCardClass}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
            <Crown className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <p className={mutedTextClass}>Enterprise</p>
            <p className="text-2xl font-bold text-foreground">{enterpriseCount}</p>
          </div>
        </div>
      </div>

      <div className={revenueHighlightClass}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-green-600 dark:text-green-400">MRR Total</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              ${totalMRR.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      <div className={revenueHighlightClass}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-green-600 dark:text-green-400">ARR Total</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              ${totalARR.toFixed(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
