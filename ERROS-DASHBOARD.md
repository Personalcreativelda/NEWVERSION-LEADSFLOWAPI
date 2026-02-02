# 🔧 Erros do Dashboard.tsx - Guia de Correção

## Resumo
Existem **9 erros de tipagem** no arquivo `src/app/components/Dashboard.tsx` que precisam ser corrigidos.

---

## ❌ Erro 1: Ícones não importados
**Linhas:** 1743, 1761

**Problema:**
```tsx
<AlertCircle className="w-6 h-6 mt-0.5" />
<X className="w-5 h-5" />
```
`AlertCircle` e `X` não estão importados.

**Solução:**
Adicionar ao import do lucide-react no topo do arquivo:
```tsx
import { AlertCircle, X, /* outros ícones existentes */ } from 'lucide-react';
```

---

## ❌ Erro 2: Props inexistentes em NavigationSidebarProps
**Linha:** 1703

**Problema:**
```tsx
currentPage={currentPage}
```
A prop `currentPage` não existe no tipo `NavigationSidebarProps`.

**Solução:**
Adicionar a prop na interface `NavigationSidebarProps`:
```tsx
interface NavigationSidebarProps {
  // ... outras props
  currentPage?: string;
}
```

---

## ❌ Erro 3: Props inexistentes em RefactoredHeaderProps
**Linha:** 1721

**Problema:**
```tsx
currentPage={currentPage}
```
A prop `currentPage` não existe no tipo `RefactoredHeaderProps`.

**Solução:**
Adicionar a prop na interface `RefactoredHeaderProps`:
```tsx
interface RefactoredHeaderProps {
  // ... outras props
  currentPage?: string;
}
```

---

## ❌ Erro 4: Prop 'key' em ChartsSectionProps
**Linha:** 1803

**Problema:**
```tsx
key={`charts-${leads.length}-${leadsFiltradosPorFiltros.length}`}
```
A prop `key` é uma prop reservada do React e não deve estar na interface do componente.

**Solução:**
Remover `key` da prop ou envolver o componente em um Fragment:
```tsx
<React.Fragment key={`charts-${leads.length}`}>
  <ChartsSection ... />
</React.Fragment>
```

---

## ❌ Erro 5: Função handleDeletarLead não existe
**Linha:** 1970

**Problema:**
```tsx
await handleDeletarLead(leadId);
```
A função `handleDeletarLead` não existe. A função correta é `handleDelete`.

**Solução:**
```tsx
await handleDelete(leadId);
```

---

## ❌ Erro 6: Função handleAtualizarStatusLead não existe
**Linha:** 1975

**Problema:**
```tsx
await handleAtualizarStatusLead(leadId, 'novo');
```

**Solução:**
Criar a função ou usar a função existente de atualização de status. Verificar no código qual função existe para atualizar status de leads.

---

## ❌ Erro 7: Tipo incompatível em handleEditarLead
**Linha:** 2085

**Problema:**
```tsx
onSave={handleEditarLead}
```
O tipo `Lead` do parâmetro tem `id` opcional, mas o tipo esperado requer `id` obrigatório.

**Solução:**
Ajustar a interface `Lead` para ter `id` obrigatório, ou fazer type assertion:
```tsx
onSave={(lead) => handleEditarLead(lead as Lead)}
```

---

## ❌ Erro 8: Prop 'key' em PreviewWhatsAppLeadsModalProps
**Linha:** 2199

**Problema:**
```tsx
key={whatsappImportKey}
```

**Solução:**
Mesmo que Erro 4 - envolver em Fragment ou remover:
```tsx
<React.Fragment key={whatsappImportKey}>
  <PreviewWhatsAppLeadsModal ... />
</React.Fragment>
```

---

## ❌ Erro 9: Prop 'onSendSuccess' inexistente
**Linha:** 2206

**Problema:**
```tsx
onSendSuccess={() => { ... }}
```
A prop `onSendSuccess` não existe em `CampaignEmailModalProps`.

**Solução:**
Adicionar a prop na interface:
```tsx
interface CampaignEmailModalProps {
  // ... outras props
  onSendSuccess?: () => void;
}
```

---

## ✅ Correção Rápida - Imports

Adicionar no topo do `Dashboard.tsx`:
```tsx
import { AlertCircle, X } from 'lucide-react';
```

---

## 📝 Notas

1. **Erros de tipo não impedem a compilação** se estiver usando `// @ts-ignore` ou configuração relaxada do TypeScript
2. A maioria dos erros são **props faltando nas interfaces** dos componentes
3. Os erros de **funções inexistentes** precisam ser verificados - pode ser renomeação ou remoção de código

---

## 🎨 Dark Mode - Background Principal (Corrigido)

O dark mode do background principal foi configurado:
- CSS Variables em `globals.css` usando hue 0 (preto neutro)
- Overrides com `!important` para garantir fundo preto
- Gradient orbs removidos do Dashboard.tsx
- Cores: `#141414` (background), `#1c1c1c` (cards)

---

## 🔵 PROBLEMA: Modais com Tom Azulado

### Causa
Alguns modais ainda mostram tom azulado porque têm **cores hardcoded** usando classes Tailwind como:
- `bg-slate-800`, `bg-slate-900`
- `bg-gray-800`, `bg-gray-900`
- `border-slate-700`, `border-gray-700`

Essas classes têm um **hue azulado** por padrão no Tailwind.

### Arquivos Afetados (Modais)
Verificar e corrigir os seguintes arquivos:
- `NovoLeadModal.tsx`
- `EditarLeadModal.tsx`
- `CampaignEmailModal.tsx`
- `PreviewWhatsAppLeadsModal.tsx`
- `ReportExporter.tsx`
- `ProductTour.tsx`
- Qualquer outro modal em `src/app/components/`

### Solução

**Opção 1: Usar CSS Variables (Recomendado)**
Substituir classes hardcoded por CSS variables:
```tsx
// ❌ ANTES (tom azulado)
className="bg-slate-800 border-slate-700"

// ✅ DEPOIS (preto neutro)
className="bg-card border-border"
// ou
style={{ background: 'hsl(var(--card))', borderColor: 'hsl(var(--border))' }}
```

**Opção 2: Usar cores neutras diretas**
```tsx
// ❌ ANTES
className="dark:bg-slate-800"

// ✅ DEPOIS
className="dark:bg-neutral-800"
// ou
className="dark:bg-zinc-800"
```

**Opção 3: Override no globals.css**
Já existe override no `globals.css`, mas pode não estar funcionando em todos os casos:
```css
.dark .dark\:bg-slate-800 {
  background-color: #262626 !important;
}
.dark .dark\:bg-slate-900 {
  background-color: #171717 !important;
}
```

### Mapeamento de Cores

| Classe Azulada | Cor Neutra | Hex |
|----------------|------------|-----|
| `slate-800` | `neutral-800` | `#262626` |
| `slate-900` | `neutral-900` | `#171717` |
| `gray-800` | `neutral-800` | `#262626` |
| `gray-900` | `neutral-900` | `#171717` |
| `slate-700` | `neutral-700` | `#404040` |

### Como Encontrar Modais com Problema

Execute no terminal:
```powershell
Select-String -Path "src/app/components/*.tsx" -Pattern "bg-slate-|bg-gray-" | Select-Object Filename, LineNumber, Line
```

### Prioridade de Correção
1. **Alta**: Modais principais (NovoLead, EditarLead)
2. **Média**: Modais de campanha e WhatsApp
3. **Baixa**: Componentes secundários

---

## 🧭 PROBLEMA: Menu da Sidebar Não Navegava (CORRIGIDO ✅)

### Causa
O `NavigationSidebar.tsx` e `RefactoredHeader.tsx` usavam **React Router** (`NavLink`, `useNavigate`, `useLocation`), mas a aplicação usa **navegação por estado** (`currentPage` + `setCurrentPage`).

### Solução Aplicada
1. Removido imports do React Router
2. Adicionado props `currentPage` e `onNavigate` às interfaces
3. Substituído `NavLink` por `<button>` com `onClick`
4. Mapeamento de paths para page IDs:
```tsx
const pathToPageId = {
  '/dashboard': 'dashboard',
  '/dashboard/leads': 'leads',
  '/dashboard/analytics': 'analytics',
  // ...
};
```

### Arquivos Modificados
- `src/app/components/navigation/NavigationSidebar.tsx`
- `src/app/components/navigation/RefactoredHeader.tsx`
