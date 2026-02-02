// TRECHO PARA SUBSTITUIR NO handleImportWhatsAppContacts
// A partir da linha 748

      console.log('[WhatsApp Import] ================================================');
      console.log('[WhatsApp Import] 🚀 NOVA IMPORTAÇÃO DE CONTATOS INICIADA');
      console.log('[WhatsApp Import] 📱 SEMPRE USANDO EVOLUTION API DIRETA (SEM N8N)');
      console.log('[WhatsApp Import] ================================================');
      
      // ✅ ADICIONAR timestamp para forçar nova requisição (evitar cache)
      const timestamp = Date.now();
      console.log('[WhatsApp Import] 🕐 Timestamp da requisição:', timestamp);
      
      // ✅ SEMPRE usar Evolution API direta (ignorar webhook N8N)
      const usedN8N = false;
      const dataSource = 'evolution_api_direct';
      
      console.log('[WhatsApp Import] 🔗 Buscando contatos diretamente da Evolution API...');
      toast.info('🔄 Buscando contatos do WhatsApp...', { duration: 2000 });
      
      const response = await fetch(`https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/whatsapp/import-contacts-direct?t=${timestamp}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

