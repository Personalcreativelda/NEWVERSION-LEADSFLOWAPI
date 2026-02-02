// Import WhatsApp Contacts - Busca direta da Evolution API (SEM webhook N8N)
// Este endpoint busca os contatos diretamente da Evolution API
// Path: /make-server-4be966ab/whatsapp/import-contacts-direct

export async function handleWhatsAppImportDirect(c: any, authMiddleware: any, kv: any, cleanApiUrl: any) {
  try {
    const user = c.get('user');
    
    console.log(`[WhatsApp Import Direct] Importing contacts for user: ${user.id}`);

    // Get Evolution API credentials
    const evolutionApiUrl = cleanApiUrl(Deno.env.get('EVOLUTION_API_URL') || '');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('[WhatsApp Import Direct] Evolution API not configured');
      return c.json({ 
        error: 'Evolution API não configurada. Entre em contato com o suporte.',
        needsConfiguration: true
      }, 500);
    }

    const instanceName = `leadflow_${user.id}`;
    console.log(`[WhatsApp Import Direct] Instance name: ${instanceName}`);
    console.log(`[WhatsApp Import Direct] Evolution API URL: ${evolutionApiUrl}`);

    // Primeiro, verificar status da instância
    console.log(`[WhatsApp Import Direct] Checking instance status...`);
    const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    console.log(`[WhatsApp Import Direct] Status response: ${statusResponse.status}`);

    if (!statusResponse.ok) {
      console.error('[WhatsApp Import Direct] Instance not found or not connected');
      return c.json({ 
        error: 'WhatsApp não conectado. Por favor, conecte seu WhatsApp usando o QR Code primeiro.',
        needsConnection: true
      }, 400);
    }

    const statusData = await statusResponse.json();
    console.log(`[WhatsApp Import Direct] Instance status:`, statusData);

    // Verificar se está conectado
    const isConnected = statusData.state === 'open' || statusData.instance?.state === 'open';
    
    if (!isConnected) {
      console.error('[WhatsApp Import Direct] WhatsApp not connected:', statusData.state || statusData.instance?.state);
      return c.json({ 
        error: 'WhatsApp não conectado. Por favor, reconecte usando o QR Code.',
        needsConnection: true
      }, 400);
    }

    // Buscar contatos diretamente da Evolution API
    console.log(`[WhatsApp Import Direct] Fetching contacts from Evolution API...`);
    const contactsResponse = await fetch(`${evolutionApiUrl}/chat/findContacts/${instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    console.log(`[WhatsApp Import Direct] Contacts response status: ${contactsResponse.status}`);

    if (!contactsResponse.ok) {
      const errorData = await contactsResponse.json().catch(() => ({}));
      console.error('[WhatsApp Import Direct] Failed to fetch contacts:', errorData);
      throw new Error('Não foi possível buscar contatos do WhatsApp. Erro: ' + (errorData.message || contactsResponse.statusText));
    }

    const contactsData = await contactsResponse.json();
    console.log(`[WhatsApp Import Direct] Raw contacts data type:`, typeof contactsData);
    console.log(`[WhatsApp Import Direct] Raw contacts data keys:`, Object.keys(contactsData));

    // Handle different Evolution API response formats
    let contactsList = [];
    
    if (Array.isArray(contactsData)) {
      contactsList = contactsData;
    } else if (contactsData.data && Array.isArray(contactsData.data)) {
      contactsList = contactsData.data;
    } else if (contactsData.contacts && Array.isArray(contactsData.contacts)) {
      contactsList = contactsData.contacts;
    } else if (contactsData.response && Array.isArray(contactsData.response)) {
      contactsList = contactsData.response;
    } else {
      console.error('[WhatsApp Import Direct] Unexpected contacts format:', contactsData);
      // Tentar extrair de qualquer propriedade que seja array
      const arrayProperty = Object.keys(contactsData).find(key => Array.isArray(contactsData[key]));
      if (arrayProperty) {
        console.log(`[WhatsApp Import Direct] Found array property: ${arrayProperty}`);
        contactsList = contactsData[arrayProperty];
      } else {
        return c.json({ 
          error: 'Formato de resposta inválido da Evolution API. Contate o suporte.',
          debug: {
            type: typeof contactsData,
            keys: Object.keys(contactsData),
            sample: JSON.stringify(contactsData).substring(0, 200)
          }
        }, 500);
      }
    }

    console.log(`[WhatsApp Import Direct] Found ${contactsList.length} raw contacts`);

    // Transform contacts to our format
    const contacts = contactsList
      .map((contact: any) => {
        // Extrair dados do contato em diferentes formatos possíveis
        const id = contact.id || contact.remoteJid || contact.jid || '';
        const phoneNumber = id.split('@')[0] || '';
        
        return {
          nome: contact.pushName || contact.name || contact.notify || contact.verifiedName || phoneNumber || 'Sem Nome',
          numero: phoneNumber,
          avatar: contact.profilePicUrl || contact.avatar || contact.imgUrl || null,
        };
      })
      .filter((c: any) => {
        // Filtrar apenas contatos válidos:
        // 1. Não pode ser grupo, broadcast ou status
        // 2. Deve ter número válido
        // 3. Deve começar com 258 (código de Moçambique) ou ter código de país válido (+)
        const isValidNumber = c.numero && 
               c.numero.length > 0 && 
               !c.numero.includes('g.us') && 
               !c.numero.includes('broadcast') &&
               !c.numero.includes('status');
        
        if (!isValidNumber) return false;
        
        // Verificar se tem código do país (258 ou começa com +)
        const hasCountryCode = c.numero.startsWith('258') || 
                              c.numero.startsWith('+258') ||
                              c.numero.startsWith('+');
        
        return hasCountryCode;
      });

    console.log(`[WhatsApp Import Direct] Processed ${contacts.length} valid contacts (filtered out groups and invalid numbers)`);

    if (contacts.length === 0) {
      return c.json({ 
        success: true, 
        contatos: [],
        total: 0,
        message: 'Nenhum contato encontrado no WhatsApp. Certifique-se de que há contatos salvos.'
      });
    }

    return c.json({ 
      success: true, 
      contatos: contacts,
      total: contacts.length
    });
  } catch (error) {
    console.error('[WhatsApp Import Direct] Error:', error);
    console.error('[WhatsApp Import Direct] Error stack:', error.stack);
    return c.json({ 
      error: 'Erro ao importar contatos: ' + error.message,
      details: error.stack
    }, 500);
  }
}
