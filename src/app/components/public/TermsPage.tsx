import { COMPANY, CONTACT_EMAIL, PublicPageShell, Section } from './PublicPageShell';

const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

export default function TermsPage({ path }: { path?: string } = {}) {
  return (
    <PublicPageShell
      path={path}
      title="Termos de uso"
      updated="26 de outubro de 2026"
      intro="Estes termos regem a utilização do LeadsFlow. Ao criar uma conta ou usar o serviço, aceita-os."
    >
      <Section id="servico" title="O serviço">
        <p>
          O LeadsFlow é uma marca e um produto da <strong>{COMPANY.name}</strong>, com sede em {COMPANY.address}, que
          presta o serviço descrito nestes termos.
        </p>
        <p>
          O LeadsFlow é uma plataforma para gerir leads, conversas em vários canais, campanhas, funis de vendas e
          automações, incluindo assistentes com inteligência artificial. Está disponível na web e na aplicação para
          Android.
        </p>
      </Section>

      <Section id="conta" title="Conta">
        <ul>
          <li>Tem de ter pelo menos 18 anos e fornecer dados verdadeiros ao criar a conta.</li>
          <li>É responsável por manter a palavra-passe e os tokens de API em segurança e por toda a atividade feita na sua conta, incluindo a dos membros da equipa que convidar.</li>
          <li>Avise-nos de imediato em {mail} se suspeitar de um acesso indevido.</li>
        </ul>
      </Section>

      <Section id="planos" title="Planos e pagamentos">
        <ul>
          <li>Há um plano gratuito com limites e planos pagos, mensais ou anuais. Os limites de cada plano (leads, mensagens, campanhas, canais) são os indicados na página de planos.</li>
          <li>As subscrições renovam-se automaticamente no fim de cada período, até as cancelar. Pode cancelar a qualquer momento; o plano mantém-se até ao fim do período já pago.</li>
          <li>Os valores pagos não são reembolsáveis, salvo quando a lei o exigir.</li>
          <li>Se um pagamento falhar ou o plano expirar, algumas funcionalidades ficam limitadas até a situação ser regularizada; os seus dados não são apagados por esse motivo.</li>
          <li>Podemos alterar preços; as alterações aplicam-se a partir da renovação seguinte e são avisadas com antecedência.</li>
        </ul>
      </Section>

      <Section id="uso-aceitavel" title="Uso aceitável">
        <p>Não pode usar o LeadsFlow para:</p>
        <ul>
          <li>enviar spam ou mensagens a pessoas que não deram consentimento para as receber;</li>
          <li>enviar conteúdo ilegal, enganoso, ofensivo, discriminatório ou que viole direitos de terceiros;</li>
          <li>recolher ou tratar dados pessoais sem base legal;</li>
          <li>tentar aceder a contas ou dados de outros utilizadores, contornar limites ou perturbar o funcionamento do serviço;</li>
          <li>revender o serviço sem autorização.</li>
        </ul>
        <p>
          Ao ligar canais de terceiros (WhatsApp, Facebook, Instagram, Telegram, email ou SMS), compromete-se também a
          cumprir as regras dessas plataformas. Bloqueios ou restrições aplicados por elas às suas contas, por exemplo
          por envio de mensagens em massa, são da sua responsabilidade.
        </p>
      </Section>

      <Section id="whatsapp" title="Regras do WhatsApp">
        <p>Ao enviar mensagens de WhatsApp pelo LeadsFlow, compromete-se a cumprir as políticas do WhatsApp Business, em especial:</p>
        <ul>
          <li>só enviar mensagens a quem deu consentimento prévio (opt-in) para as receber da sua empresa, e respeitar de imediato os pedidos para deixar de receber;</li>
          <li>fora da janela de 24 horas após a última mensagem do cliente, iniciar conversas apenas com modelos de mensagem aprovados pela Meta;</li>
          <li>não vender nem promover produtos ou serviços proibidos pela Política de Comércio do WhatsApp;</li>
          <li>usar os assistentes com inteligência artificial apenas para atender os clientes da sua empresa (apoio, vendas, marcações), e não como assistente de uso geral.</li>
        </ul>
        <p>
          Consulte a{' '}
          <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer">Política do WhatsApp Business</a>{' '}
          e a{' '}
          <a href="https://www.whatsapp.com/legal/commerce-policy" target="_blank" rel="noopener noreferrer">Política de Comércio</a>.
          O incumprimento pode levar a Meta a restringir o seu número e o LeadsFlow a suspender o acesso ao canal.
        </p>
      </Section>

      <Section id="dados" title="Os seus dados">
        <ul>
          <li>Os leads, conversas e restantes dados que coloca na plataforma são seus. Pode exportá-los e apagá-los a qualquer momento.</li>
          <li>É responsável por ter base legal para tratar os dados dos seus contactos e por informá-los, quando aplicável.</li>
          <li>Tratamos esses dados apenas para lhe prestar o serviço, conforme a <a href="/privacidade">política de privacidade</a>.</li>
        </ul>
      </Section>

      <Section id="ia" title="Inteligência artificial">
        <p>
          As respostas, análises e sugestões geradas por inteligência artificial podem conter erros. Reveja-as antes de
          tomar decisões importantes. Os assistentes automáticos respondem em seu nome nos canais em que os ativar: é
          responsável pelas instruções que lhes dá e pelo que enviam.
        </p>
      </Section>

      <Section id="api" title="API">
        <p>
          A <a href="/docs">API pública</a> está sujeita a estes termos e aos limites de utilização indicados na sua
          documentação. Podemos suspender tokens usados de forma abusiva.
        </p>
      </Section>

      <Section id="disponibilidade" title="Disponibilidade e alterações">
        <p>
          Esforçamo-nos por manter o serviço sempre disponível, mas podem ocorrer interrupções por manutenção, falhas
          técnicas ou de fornecedores (incluindo as plataformas de mensagens). Podemos alterar, adicionar ou retirar
          funcionalidades; quando uma alteração lhe for desfavorável de forma relevante, avisamos com antecedência.
        </p>
      </Section>

      <Section id="responsabilidade" title="Limitação de responsabilidade">
        <p>
          O serviço é fornecido «tal como está». Na medida permitida por lei, o LeadsFlow não responde por danos
          indiretos, perda de lucros ou de dados, nem por falhas de serviços de terceiros. A nossa responsabilidade total
          fica limitada ao valor pago pelo serviço nos 12 meses anteriores ao facto que lhe deu origem.
        </p>
      </Section>

      <Section id="suspensao" title="Suspensão e cancelamento">
        <p>
          Pode deixar de usar o serviço e pedir o cancelamento da conta a qualquer momento. Podemos suspender ou encerrar
          contas que violem estes termos, em especial em casos de spam, fraude ou risco para outros utilizadores. Quando
          possível, avisamos antes e damos oportunidade de exportar os dados.
        </p>
      </Section>

      <Section id="alteracoes" title="Alterações a estes termos">
        <p>
          Podemos atualizar estes termos. As alterações relevantes são avisadas no painel ou por email antes de entrarem
          em vigor; continuar a usar o serviço depois disso significa que as aceita.
        </p>
      </Section>

      <Section id="contacto" title="Contacto">
        <p>Questões sobre estes termos: {mail}.</p>
      </Section>
    </PublicPageShell>
  );
}
