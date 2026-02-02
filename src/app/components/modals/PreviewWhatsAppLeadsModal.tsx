import { X, User, Phone, CheckCircle, MessageSquare, Edit2, Trash2, AlertCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from "sonner";

interface WhatsAppContact {
  nome: string;
  numero: string;
  avatar?: string | null;
}

interface PreviewWhatsAppLeadsModalProps {
  isOpen: boolean;
  contacts: WhatsAppContact[];
  onClose: () => void;
  onImport: (contacts: WhatsAppContact[]) => void;
  loading?: boolean;
  userPlan?: string;
  currentLeadsCount?: number;
  leadsLimit?: number;
  existingLeads?: Array<{ telefone?: string; email?: string; }>;
  dataSource?: string;  // Fonte dos dados: 'n8n_webhook', 'evolution_api_direct', etc
}

export default function PreviewWhatsAppLeadsModal({
  isOpen,
  contacts,
  onClose,
  onImport,
  loading = false,
  userPlan,
  currentLeadsCount,
  leadsLimit,
  existingLeads,
  dataSource = 'unknown',
}: PreviewWhatsAppLeadsModalProps) {
  // ✅ RESETAR completamente ao receber novos contatos
  const [modalKey] = useState(() => Date.now());
  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [editingContact, setEditingContact] = useState<number | null>(null);
  const [editedContacts, setEditedContacts] = useState<WhatsAppContact[]>([]);
  const [duplicatesCount, setDuplicatesCount] = useState(0);
  const [filteredContactsCount, setFilteredContactsCount] = useState(0);
  const [lastProcessedTimestamp, setLastProcessedTimestamp] = useState<number>(0); // ✅ Estado para rastrear processamento
  const [failedAvatars, setFailedAvatars] = useState<Set<number>>(new Set()); // ✅ Rastrear avatares com erro

  console.log('[PreviewModal] ================================================');
  console.log('[PreviewModal] 🔑 MODAL KEY:', modalKey);
  console.log('[PreviewModal] 🚪 isOpen:', isOpen);
  console.log('[PreviewModal] 📊 contacts.length recebido:', contacts.length);
  console.log('[PreviewModal] 📋 Sample contacts:', contacts.slice(0, 3));
  console.log('[PreviewModal] 📝 editedContacts.length atual:', editedContacts.length);
  console.log('[PreviewModal] ================================================');

  // Filtrar duplicados e calcular limites
  useEffect(() => {
    // ✅ LIMPAR contatos editados ao abrir modal com novos dados
    console.log('[PreviewWhatsAppModal] 🧹 Limpando dados anteriores do modal...');
    setEditedContacts([]);
    setSelectedContacts(new Set());
    setDuplicatesCount(0);
    setFilteredContactsCount(0);
    setFailedAvatars(new Set()); // ✅ Limpar avatares com erro
    
    // ✅ Gerar timestamp único para garantir reprocessamento
    const currentTimestamp = Date.now();
    
    console.log('[PreviewWhatsAppModal] ================================================');
    console.log('[PreviewWhatsAppModal] 🔄 REPROCESSANDO CONTATOS');
    console.log('[PreviewWhatsAppModal] ================================================');
    console.log('[PreviewWhatsAppModal] 📥 Total recebido:', contacts.length);
    console.log('[PreviewWhatsAppModal] 🕐 Timestamp atual:', currentTimestamp);
    console.log('[PreviewWhatsAppModal] ⏱️ Último timestamp:', lastProcessedTimestamp);
    console.log('[PreviewWhatsAppModal] 🔄 É nova importação?', currentTimestamp !== lastProcessedTimestamp);
    console.log('[PreviewWhatsAppModal] 📋 Sample (3 primeiros):', contacts.slice(0, 3));
    console.log('[PreviewWhatsAppModal] ================================================');
    
    if (contacts.length > 0) {
      // ✅ Atualizar timestamp de processamento
      setLastProcessedTimestamp(currentTimestamp);
      
      // ✅ Resetar contadores ao processar novos contatos
      console.log('[PreviewWhatsAppModal] 🧹 Limpando contadores anteriores...');
      setDuplicatesCount(0);
      setFilteredContactsCount(0);
      
      // Filtrar duplicados se existingLeads for fornecido
      let filteredContacts = [...contacts];
      let duplicates = 0;
      
      if (existingLeads && existingLeads.length > 0) {
        const existingPhones = new Set(
          existingLeads
            .map(lead => lead.telefone?.replace(/\D/g, ''))
            .filter(phone => phone)
        );
        
        filteredContacts = contacts.filter(contact => {
          const phone = contact.numero.replace(/\D/g, '');
          const isDuplicate = existingPhones.has(phone);
          if (isDuplicate) duplicates++;
          return !isDuplicate;
        });
        
        setDuplicatesCount(duplicates);
        console.log(`[PreviewWhatsAppModal] ⚠️ ${duplicates} contatos duplicados filtrados`);
      }
      
      // Aplicar limite do plano se fornecido
      if (leadsLimit && leadsLimit !== -1 && currentLeadsCount !== undefined) {
        const availableSlots = Math.max(0, leadsLimit - currentLeadsCount);
        if (availableSlots < filteredContacts.length) {
          const originalCount = filteredContacts.length;
          filteredContacts = filteredContacts.slice(0, availableSlots);
          const filtered = originalCount - filteredContacts.length;
          setFilteredContactsCount(filtered);
          console.log(`[PreviewWhatsAppModal] ⚠️ ${filtered} contatos filtrados por limite do plano`);
          toast.warning(
            `Seu plano permite ${leadsLimit} leads. Você pode importar no máximo ${availableSlots} contatos.`,
            { duration: 5000 }
          );
        }
      }
      
      console.log('[PreviewWhatsAppModal] ================================================');
      console.log('[PreviewWhatsAppModal] ✅ PROCESSAMENTO FINALIZADO');
      console.log('[PreviewWhatsAppModal] 📊 Contatos filtrados:', filteredContacts.length);
      console.log('[PreviewWhatsAppModal] ❌ Duplicados removidos:', duplicates);
      console.log('[PreviewWhatsAppModal] 🔢 Filtrados por limite:', filteredContactsCount);
      console.log('[PreviewWhatsAppModal] ✅ Contatos finais:', filteredContacts.length);
      console.log('[PreviewWhatsAppModal] ================================================');
      
      setEditedContacts(filteredContacts);
      setSelectedContacts(new Set(filteredContacts.map((_, idx) => idx)));
      
      if (duplicates > 0) {
        toast.info(
          `${duplicates} contato(s) duplicado(s) foram automaticamente removidos.`,
          { duration: 4000 }
        );
      }
    }
  }, [contacts, existingLeads, leadsLimit, currentLeadsCount]);

  if (!isOpen) return null;

  const toggleContact = (index: number) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedContacts(newSelected);
  };

  const toggleAll = () => {
    if (selectedContacts.size === editedContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(editedContacts.map((_, idx) => idx)));
    }
  };

  const handleImport = () => {
    const contactsToImport = editedContacts.filter((_, idx) => selectedContacts.has(idx));
    if (contactsToImport.length === 0) {
      toast.error('Selecione pelo menos um contato para importar');
      return;
    }
    onImport(contactsToImport);
  };

  const handleDelete = (index: number) => {
    const contact = editedContacts[index];
    if (confirm(`Deseja remover "${contact.nome}" da lista de importação?`)) {
      const newContacts = editedContacts.filter((_, idx) => idx !== index);
      setEditedContacts(newContacts);
      
      // Atualizar seleção
      const newSelected = new Set<number>();
      selectedContacts.forEach(selectedIdx => {
        if (selectedIdx < index) {
          newSelected.add(selectedIdx);
        } else if (selectedIdx > index) {
          newSelected.add(selectedIdx - 1);
        }
      });
      setSelectedContacts(newSelected);
      
      toast.success('Contato removido da lista');
    }
  };

  const handleEdit = (index: number) => {
    setEditingContact(index);
  };

  const handleSaveEdit = (index: number, nome: string, numero: string) => {
    const newContacts = [...editedContacts];
    newContacts[index] = {
      ...newContacts[index],
      nome,
      numero,
    };
    setEditedContacts(newContacts);
    setEditingContact(null);
    toast.success('Contato atualizado');
  };

  const handleSendMessage = (contact: WhatsAppContact) => {
    // Remove caracteres não numéricos do número
    const phoneNumber = contact.numero.replace(/\D/g, '');
    toast.info(`Abrindo WhatsApp para ${contact.nome}...`);
    // Abre WhatsApp com o número (funcionalidade extra - não afeta importação)
    window.open(`https://wa.me/${phoneNumber}`, '_blank');
  };

  const allSelected = selectedContacts.size === editedContacts.length && editedContacts.length > 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-card rounded-2xl shadow-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Contatos Importados do WhatsApp
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-700 dark:text-gray-300">
                {editedContacts.length} contato(s) disponível(is) para importação no CRM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-700 dark:text-gray-300" />
          </button>
        </div>

        {/* Lista de Contatos */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Alertas informativos */}
          {(duplicatesCount > 0 || filteredContactsCount > 0 || editedContacts.length > 50) && (
            <div className="mb-4 space-y-2">
              {editedContacts.length > 50 && (
                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-orange-900 dark:text-orange-200">
                    <strong>⚠️ Importação Grande Detectada:</strong> Você está tentando importar {editedContacts.length} contatos. Para melhor performance, recomendamos importar em lotes menores de 50 contatos por vez. Se enfrentar problemas, tente selecionar menos contatos.
                  </div>
                </div>
              )}
              {duplicatesCount > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900 dark:text-blue-200">
                    <strong>{duplicatesCount}</strong> contato(s) duplicado(s) foram automaticamente removidos para evitar importações duplicadas.
                  </div>
                </div>
              )}
              {filteredContactsCount > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-900 dark:text-amber-200">
                    <strong>{filteredContactsCount}</strong> contato(s) foram filtrados devido ao limite do seu plano <strong>({userPlan?.toUpperCase() || 'FREE'})</strong>. Faça upgrade para importar mais leads.
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Botão Selecionar Todos */}
          <div className="mb-4 flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {selectedContacts.size} de {editedContacts.length} selecionado(s)
            </span>
            <button
              onClick={toggleAll}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {allSelected ? 'Desmarcar Todos' : 'Selecionar Todos'}
            </button>
          </div>

          {editedContacts.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                <User className="w-8 h-8 text-gray-700 dark:text-gray-300" />
              </div>
              <p className="text-gray-500 dark:text-gray-700 dark:text-gray-300">Nenhum contato disponível</p>
            </div>
          ) : (
            <div className="space-y-3">
              {editedContacts.map((contact, index) => (
                <div
                  key={index}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                    selectedContacts.has(index)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-600'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    onClick={() => toggleContact(index)}
                    className="cursor-pointer"
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedContacts.has(index)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {selectedContacts.has(index) && (
                        <CheckCircle className="w-4 h-4 text-white" />
                      )}
                    </div>
                  </div>

                  {/* Avatar */}
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-600 flex-shrink-0">
                    {contact.avatar && !failedAvatars.has(index) ? (
                      <img
                        src={contact.avatar}
                        alt={contact.nome}
                        className="w-full h-full object-cover"
                        onError={() => {
                          // ✅ Usar estado React em vez de manipular DOM diretamente
                          setFailedAvatars(prev => new Set([...prev, index]));
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500">
                        <span className="text-white font-semibold text-lg">
                          {contact.nome.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info - Editable */}
                  {editingContact === index ? (
                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        type="text"
                        defaultValue={contact.nome}
                        id={`edit-nome-${index}`}
                        className="w-full px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                        placeholder="Nome"
                      />
                      <input
                        type="text"
                        defaultValue={contact.numero}
                        id={`edit-numero-${index}`}
                        className="w-full px-3 py-1.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm"
                        placeholder="Número"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {contact.nome}
                      </p>
                      <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-700 dark:text-gray-300">
                        <Phone className="w-3 h-3" />
                        <span>{contact.numero}</span>
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {editingContact === index ? (
                      <>
                        <button
                          onClick={() => {
                            const nome = (document.getElementById(`edit-nome-${index}`) as HTMLInputElement).value;
                            const numero = (document.getElementById(`edit-numero-${index}`) as HTMLInputElement).value;
                            handleSaveEdit(index, nome, numero);
                          }}
                          className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                          title="Salvar"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingContact(null)}
                          className="p-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleSendMessage(contact)}
                          className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                          title="Enviar mensagem no WhatsApp"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEdit(index)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Editar contato"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(index)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          title="Remover da lista"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-700 dark:text-gray-300">
            Os contatos selecionados serão importados como leads no CRM
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={selectedContacts.size === 0 || loading || editedContacts.length === 0}
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Importando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Importar para CRM ({selectedContacts.size})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



