import { useState, useEffect, type CSSProperties } from 'react';
import { Menu, X, Zap, LogIn } from 'lucide-react';
import { Button } from './ui/button';

interface HeaderProps {
  onLogin?: () => void;
  onSignup?: () => void;
}

export default function Header({ onLogin, onSignup }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const gradientCtaStyle: CSSProperties = {
    backgroundImage: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 55%, #a855f7 100%)',
    boxShadow: '0 14px 36px -20px rgba(129, 140, 248, 0.8)',
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const menuItems = [
    { label: 'Início', href: '#inicio' },
    { label: 'Recursos', href: '#recursos' },
    { label: 'Planos', href: '#planos' },
    { label: 'Depoimentos', href: '#depoimentos' },
    { label: 'FAQ', href: '#faq' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-background/95 backdrop-blur-md shadow-lg shadow-purple-500/10'
          : 'bg-background/80 backdrop-blur-sm'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-white text-lg sm:text-xl font-semibold">LeadsFlow API</span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {menuItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-3">
            <Button 
              variant="ghost" 
              className="text-gray-300 hover:text-white hover:bg-white/10"
              onClick={onLogin}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Entrar
            </Button>
            <Button 
              onClick={onSignup}
              className="bg-transparent text-white px-6 hover:brightness-110 transition-transform hover:-translate-y-0.5"
              style={gradientCtaStyle}
            >
              Criar Conta Grátis
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="lg:hidden p-2 text-gray-300 hover:text-white"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <div className="lg:hidden py-4 border-t border-gray-700 bg-card">
            <nav className="flex flex-col gap-4">
              {menuItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="text-gray-300 hover:text-white transition-colors px-2 py-1"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              <div className="flex flex-col gap-2 pt-4 border-t border-gray-700">
                <Button 
                  variant="ghost" 
                  className="text-gray-300 hover:text-white hover:bg-white/10 w-full"
                  onClick={onLogin}
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Entrar
                </Button>
                <Button 
                  onClick={onSignup}
                  className="bg-transparent text-white w-full hover:brightness-110"
                  style={gradientCtaStyle}
                >
                  Criar Conta Grátis
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}

