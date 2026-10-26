import { COMPANY, CONTACT_EMAIL, PublicPageShell, Section, SITE_URL } from './PublicPageShell';

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function PrivacyPage({ path }: { path?: string } = {}) {
  return (
    <PublicPageShell
      path={path}
      title="Política de privacidade"
      updated="26 de outubro de 2026"
      intro="Esta política explica que dados o LeadsFlow trata, para quê, com quem os partilha e que direitos tem sobre eles."
    >
      <Section id="quem-somos" title="Quem somos">
        <p>
          O LeadsFlow é uma marca e um produto da <strong>{COMPANY.name}</strong>, com sede em {COMPANY.address}, a
          entidade responsável pelo tratamento de dados descrito nesta política. Neste documento, «LeadsFlow», «nós» e
          «nosso» referem-se à {COMPANY.name}.
        </p>
        <p>
          O LeadsFlow é uma plataforma de gestão de leads, conversas e campanhas, disponível em{' '}
          <a href={SITE_URL}>leadsflowapi.com</a>, em <a href="https://app.leadsflowapi.com">app.leadsflowapi.com</a> e
          na aplicação para Android. Para qualquer questão sobre privacidade, contacte-nos em {mail}.
        </p>
        <p>
          Tratamos os dados de duas formas: como <strong>responsável</strong> pelos dados da sua conta (por exemplo, o seu
          nome e email) e como <strong>subcontratante</strong> dos dados que coloca na plataforma sobre os seus próprios
          clientes e contactos (os seus leads e as conversas com eles). Nesse segundo caso, quem decide para que servem
          esses dados é o cliente que usa o LeadsFlow.
        </p>
      </Section>

      <Section id="dados-recolhidos" title="Que dados recolhemos">
        <h3>Dados da conta</h3>
        <ul>
          <li>Nome, email, fotografia de perfil e palavra-passe (guardada apenas em formato cifrado e irreversível).</li>
          <li>Dados da equipa: membros convidados, os seus emails e papéis.</li>
          <li>Plano subscrito e histórico de pagamentos. Os dados de cartão são tratados diretamente pelo processador de pagamentos; o LeadsFlow não os guarda.</li>
        </ul>

        <h3>Dados que coloca na plataforma</h3>
        <ul>
          <li>Leads e contactos: nome, telefone, email, empresa, notas, etiquetas, etapa do funil e valor do negócio.</li>
          <li>Mensagens e ficheiros trocados nos canais que ligar (WhatsApp, Facebook Messenger, Instagram, Telegram, email, SMS e chat do site).</li>
          <li>Campanhas, modelos de mensagem, tarefas, fluxos de remarketing e configurações dos assistentes virtuais.</li>
        </ul>

        <h3>Dados dos canais ligados</h3>
        <p>
          Quando liga uma conta de outra plataforma (por exemplo, uma página do Facebook ou uma conta do Instagram através
          do login da Meta), recebemos os identificadores e os tokens de acesso necessários para enviar e receber mensagens
          em seu nome. Esses tokens são guardados cifrados e nunca são mostrados de volta no painel.
        </p>

        <h3>Dados de utilização</h3>
        <ul>
          <li>Registos técnicos: endereço IP, tipo de dispositivo, data e hora dos pedidos e as áreas do painel usadas, para segurança, suporte e melhoria do serviço.</li>
          <li>Na aplicação Android, uma cópia dos dados recentes fica guardada no próprio aparelho para funcionar sem ligação; é apagada quando termina a sessão.</li>
        </ul>
      </Section>

      <Section id="finalidades" title="Para que usamos os dados">
        <ul>
          <li>Prestar o serviço: mostrar os leads, enviar e receber mensagens, executar campanhas e automações.</li>
          <li>Funcionalidades de inteligência artificial que ativar: responder automaticamente, analisar leads, transcrever áudios e gerar respostas por voz.</li>
          <li>Gerir a conta, a faturação e o suporte.</li>
          <li>Segurança: prevenir abusos, acessos indevidos e fraude.</li>
          <li>Enviar avisos sobre o serviço (por exemplo, alterações de plano ou de segurança).</li>
        </ul>
        <p>
          Não vendemos dados pessoais e não os usamos para publicidade de terceiros. Os dados dos seus leads só são
          usados para lhe prestar o serviço.
        </p>
      </Section>

      <Section id="partilha" title="Com quem partilhamos">
        <p>Partilhamos dados apenas com fornecedores que nos ajudam a prestar o serviço, e só na medida necessária:</p>
        <ul>
          <li><strong>Alojamento e armazenamento</strong> dos servidores, da base de dados e dos ficheiros.</li>
          <li><strong>Plataformas de mensagens</strong> que liga à sua conta (Meta — WhatsApp, Facebook e Instagram —, Telegram, fornecedores de email e de SMS), para entregar as mensagens.</li>
          <li><strong>Pagamentos</strong>: Stripe e PayPal processam os pagamentos das subscrições.</li>
          <li><strong>Inteligência artificial</strong>: quando usa assistentes virtuais, agentes de voz ou análises com IA, o conteúdo necessário (por exemplo, a mensagem a que se vai responder) é enviado a fornecedores de modelos de IA para gerar a resposta.</li>
          <li><strong>Integrações que configurar</strong> (por exemplo, webhooks, folhas de cálculo ou píxeis de conversão), que recebem os dados que escolher enviar.</li>
          <li><strong>Autoridades</strong>, quando a lei o exigir.</li>
        </ul>
      </Section>

      <Section id="seguranca" title="Como protegemos os dados">
        <ul>
          <li>Ligações cifradas (HTTPS) entre o seu dispositivo e os nossos servidores.</li>
          <li>Palavras-passe guardadas com função de hash; tokens e credenciais dos canais cifrados (AES-256).</li>
          <li>Verificação em dois passos opcional e tokens de API que pode revogar a qualquer momento.</li>
          <li>Cada conta só vê os seus próprios dados; o acesso da equipa depende do papel atribuído.</li>
        </ul>
      </Section>

      <Section id="conservacao" title="Durante quanto tempo guardamos">
        <p>
          Guardamos os dados enquanto a conta estiver ativa. Quando pede a eliminação da conta, os dados são apagados no
          prazo de 30 dias, exceto o que a lei nos obrigue a manter (por exemplo, registos de faturação). Pode apagar
          leads, conversas e canais a qualquer momento a partir do painel.
        </p>
      </Section>

      <Section id="direitos" title="Os seus direitos">
        <p>Pode, a qualquer momento:</p>
        <ul>
          <li>aceder aos seus dados e obter uma cópia (os leads podem ser exportados em CSV a partir do painel);</li>
          <li>corrigir dados incorretos;</li>
          <li>pedir a eliminação dos seus dados ou da conta;</li>
          <li>opor-se a um tratamento ou pedir a sua limitação;</li>
          <li>retirar consentimentos que tenha dado.</li>
        </ul>
        <p>
          Para exercer estes direitos, escreva para {mail}. Respondemos no prazo de 30 dias. Se é contacto de um cliente
          do LeadsFlow (por exemplo, recebeu uma mensagem de uma empresa que usa a plataforma), dirija o pedido a essa
          empresa; ajudá-la-emos a responder.
        </p>
      </Section>

      <Section id="dados-meta" title="Dados das plataformas da Meta">
        <p>
          Quando liga ao LeadsFlow uma conta do WhatsApp Business, uma página do Facebook ou uma conta do Instagram,
          recebemos através das APIs da Meta os dados necessários para gerir essas conversas: identificadores das contas,
          números e nomes de perfil dos contactos, mensagens, ficheiros e o estado de entrega das mensagens.
        </p>
        <ul>
          <li>Usamos esses dados apenas para lhe prestar o serviço: mostrar e responder às conversas, enviar as mensagens e campanhas que pedir e executar as automações que configurar.</li>
          <li>Não os vendemos, não os usamos para publicidade e não os partilhamos com terceiros, exceto os fornecedores necessários ao serviço descritos acima.</li>
          <li>Não os usamos para treinar modelos de inteligência artificial.</li>
          <li>Apagamo-los quando remove o canal, quando pede a eliminação da conta ou quando a Meta nos pede.</li>
        </ul>
        <p>
          O tratamento destes dados cumpre também os{' '}
          <a href="https://developers.facebook.com/terms" target="_blank" rel="noopener noreferrer">Termos da Plataforma da Meta</a>{' '}
          e as{' '}
          <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">políticas do WhatsApp Business</a>.
        </p>
      </Section>

      <Section id="eliminacao-de-dados" title="Eliminação de dados">
        <p>Para apagar os dados associados à sua conta, incluindo os obtidos através do Facebook ou do Instagram:</p>
        <ol>
          <li>No LeadsFlow, abra <strong>Definições → Canais ligados</strong> e remova os canais que quer apagar. Os tokens de acesso dessas contas são apagados com o canal.</li>
          <li>Para apagar a conta e todos os dados, envie um email para {mail} a partir do email da conta, com o assunto «Eliminar conta».</li>
          <li>Confirmamos o pedido e apagamos os dados no prazo de 30 dias.</li>
        </ol>
        <p>
          Também pode remover o acesso do LeadsFlow nas definições da sua conta da Meta, em «Apps e websites»; nesse caso
          deixamos de receber dados dessa conta.
        </p>
      </Section>

      <Section id="menores" title="Menores">
        <p>O LeadsFlow destina-se a empresas e profissionais e não se dirige a menores de 18 anos.</p>
      </Section>

      <Section id="alteracoes" title="Alterações a esta política">
        <p>
          Podemos atualizar esta política. Quando a alteração for relevante, avisamos no painel ou por email antes de ela
          entrar em vigor. A data no topo indica a última revisão.
        </p>
      </Section>

      <Section id="contacto" title="Contacto">
        <p>Questões sobre privacidade ou sobre esta política: {mail}.</p>
      </Section>
    </PublicPageShell>
  );
}
