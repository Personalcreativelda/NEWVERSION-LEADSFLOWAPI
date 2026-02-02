import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { authApi } from '../utils/api';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);

    try {
      const response = await authApi.signin(email.trim(), senha);

      if (response.success) {
        window.location.reload();
        return;
      }

      setErro('Não foi possível autenticar. Tente novamente.');
    } catch (error: any) {
      const message = error?.message || 'Erro ao fazer login. Por favor, tente novamente.';
      setErro(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 px-4">
      
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-300 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Login Box */}
      <div className="relative bg-white rounded-3xl shadow-lg p-8 sm:p-12 w-full max-w-md">
        
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl items-center justify-center mb-4 shadow-lg">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-gray-900 mb-2">Bem-vindo</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">Faça login para acessar seu CRM</p>
        </div>

        {/* Erro */}
        {erro && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {erro}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div>
            <label htmlFor="email" className="block text-sm text-gray-700 mb-2">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Digite seu e-mail"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm text-gray-700 mb-2">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              placeholder="Digite sua senha"
            />
          </div>

          <div className="flex items-center">
            <input
              id="lembrar"
              type="checkbox"
              defaultChecked
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="lembrar" className="ml-2 text-sm text-gray-700">
              Manter-me conectado por 8 horas
            </label>
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Entrando...
              </span>
            ) : (
              'Entrar'
            )}
          </Button>

        </form>

        {/* Links */}
        <div className="mt-6 text-center space-y-3">
          <a href="#" className="block text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 transition-colors">
            Esqueci minha senha
          </a>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Não tem uma conta?{' '}
            <a href="#" className="text-blue-600 hover:text-blue-700 transition-colors">
              Criar conta
            </a>
          </p>
        </div>

        {/* Demo Credentials */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-700 mb-2">
            <strong>Credenciais de demonstração:</strong>
          </p>
          <p className="text-xs text-blue-600 font-mono">
            demo@leadflow.com / demo123
          </p>
        </div>

        {/* Version */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            v2024.11.11 • <span className="text-green-600">Período de teste: 7 dias</span>
          </p>
        </div>

      </div>
    </div>
  );
}

