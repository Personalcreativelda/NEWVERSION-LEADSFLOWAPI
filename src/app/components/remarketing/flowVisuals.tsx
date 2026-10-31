// Ícones e cores de cada tipo de passo (lista de fluxos, modelos e editor)
import type { ElementType } from 'react';
import {
  Bell, Clock, Filter, GitBranch, ListChecks, Mail, MessageSquare, Mic, Split, StickyNote, Tag, TagsIcon, TrendingUp,
} from 'lucide-react';
import { brandIcon } from '../base/BrandIcon';
import type { ActionType } from './flowTypes';

export const STEP_ICONS: Record<ActionType, ElementType> = {
  message: MessageSquare,
  whatsapp: brandIcon('whatsapp'),
  facebook: brandIcon('messenger'),
  instagram: brandIcon('instagram'),
  telegram: brandIcon('telegram'),
  email: Mail,
  dynamic_audio: Mic,
  ab_test: Split,
  wait: Clock,
  condition: Filter,
  move_stage: GitBranch,
  tag: Tag,
  remove_tag: TagsIcon,
  create_task: ListChecks,
  add_note: StickyNote,
  notify: Bell,
  score: TrendingUp,
};

export const STEP_COLORS: Record<ActionType, string> = {
  message: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  whatsapp: 'text-emerald-500 bg-emerald-500/10',
  facebook: 'text-blue-600 bg-blue-600/10',
  instagram: 'text-pink-500 bg-pink-500/10',
  telegram: 'text-sky-500 bg-sky-500/10',
  email: 'text-blue-500 bg-blue-500/10',
  dynamic_audio: 'text-purple-500 bg-purple-500/10',
  ab_test: 'text-rose-500 bg-rose-500/10',
  wait: 'text-amber-500 bg-amber-500/10',
  condition: 'text-orange-500 bg-orange-500/10',
  move_stage: 'text-cyan-500 bg-cyan-500/10',
  tag: 'text-violet-500 bg-violet-500/10',
  remove_tag: 'text-violet-500 bg-violet-500/10',
  create_task: 'text-indigo-500 bg-indigo-500/10',
  add_note: 'text-slate-500 bg-slate-500/10',
  notify: 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10',
  score: 'text-teal-500 bg-teal-500/10',
};
