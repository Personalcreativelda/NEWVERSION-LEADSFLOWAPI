import { useState } from 'react';
import { Button } from './ui/button';
import { AlertCircle, CheckCircle, Zap, ArrowLeft, LogIn } from 'lucide-react';
import { authApi } from '../utils/api';

interface SetupTestUserProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function SetupTestUser({ onBack, onSuccess }: SetupTestUserProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [testingLogin, setTestingLogin] = useState(false);

  const setupTestUser = async () => {
    setLoading(true);
    setError('');
    setSuccess(false);
    setWarning('');

    try {
      const response = await fetch(
        'https://wtvnrrmmimrruvpukxnj.supabase.co/functions/v1/make-server-4be966ab/auth/setup-admin',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      // Check if setup was partially successful (user created but sign in verification failed)
      if (data.success === false && data.credentials) {
        setWarning(data.error || 'Usuário criado, mas a verificação falhou. Aguarde alguns segundos antes de fazer login.');
        setCredentials(data.credentials);
        setSuccess(true);
      } else if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao configurar usuário de teste');
      } else {
        setSuccess(true);
        if (data.credentials) {
          setCredentials(data.credentials);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao configurar usuário de teste');
    } finally {
      setLoading(false);
    }
  };

  const testLogin = async () => {
    if (!credentials) return;
    
    setTestingLogin(true);
    setError('');
    setWarning('');

    try {
      console.log('Testing login with credentials:', credentials.email);
      const response = await authApi.signin(credentials.email, credentials.password);
      
      if (response.success) {
        console.log('Login test successful! Redirecting to dashboard...');
        onSuccess();
      }
    } catch (err: any) {
      console.error('Login test failed:', err);
      setError(`❌ Falha no teste de login: ${err.message}. Aguarde alguns segundos e tente novamente, ou volte para a tela de login.`);
    } finally {
      setTestingLogin(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <span className="text-gray-900">LeadFlow CRM</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-md p-8">
          <h2 className="text-gray-900 mb-2 text-center">Configurar Usuário de Teste</h2>
          <p className="text-gray-700 dark:text-gray-300 text-center mb-6">
            Clique no botão abaixo para criar um usuário de teste para desenvolvimento
          </p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {warning && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-yellow-800">{warning}</p>
            </div>
          )}

          {success && credentials && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3 mb-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-green-700">
                  {warning ? 'Usuário criado! Aguarde alguns segundos antes de fazer login.' : 'Usuário de teste configurado com sucesso!'}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-green-200">
                <p className="text-gray-700 mb-1">
                  <strong>Email:</strong> {credentials.email}
                </p>
                <p className="text-gray-700">
                  <strong>Senha:</strong> {credentials.password}
                </p>
              </div>
              <p className="text-green-600 mt-3 text-center">
                Use essas credenciais para fazer login
              </p>
              {warning && (
                <p className="text-yellow-600 mt-2 text-center">
                  ⏰ Aguarde pelo menos 3 segundos antes de fazer login
                </p>
              )}
            </div>
          )}

          {!success ? (
            <>
              <Button
                onClick={setupTestUser}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? 'Configurando...' : 'Configurar Usuário de Teste'}
              </Button>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-900">
                  <strong>Nota:</strong> Este botão cria ou atualiza um usuário de teste com o plano Ilimitado. Use apenas para desenvolvimento.
                </p>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <Button
                onClick={testLogin}
                disabled={testingLogin}
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                <LogIn className="w-4 h-4 mr-2" />
                {testingLogin ? 'Testando Login...' : 'Testar Login Agora'}
              </Button>
              <Button
                onClick={onBack}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao Login
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            © {new Date().getFullYear()} PersonalCreativeLda. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}

