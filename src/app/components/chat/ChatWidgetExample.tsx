// Exemplo de como adicionar o ChatWidget no seu App.tsx

import { ChatWidget } from './components/chat/ChatWidget';
import { useNavigate, useLocation } from 'react-router-dom';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Pegar dados do usuário (exemplo)
  const user = {
    id: 'user_123',
    name: 'Ekson Cuamba',
    planName: 'Enterprise'
  };

  return (
    <div className="app">
      {/* Seu conteúdo principal */}
      <YourMainContent />
      
      {/* Chat Widget - sempre visível */}
      <ChatWidget 
        onNavigate={(url) => navigate(url)}
        userId={user.id}
        userName={user.name}
        userPlan={user.planName}
        currentPage={location.pathname}
      />
    </div>
  );
}

export default App;

