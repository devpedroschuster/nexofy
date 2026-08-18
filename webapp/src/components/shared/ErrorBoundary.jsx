import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

// Chave de sessão usada para garantir no máximo UMA tentativa automática de
// reload por falha de chunk. Sem isso, um deploy com cache de CDN
// inconsistente pode gerar um loop infinito de reload (bug crítico
// encontrado na versão anterior).
const CHUNK_RELOAD_FLAG = 'nexofy:chunk-reload-attempted';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Erro capturado pelo ErrorBoundary:', error, errorInfo);

    const isChunkError = /Failed to fetch dynamically imported module|Loading chunk .* failed/i.test(
      error?.message || ''
    );

    if (isChunkError) {
      const jaTentou = window.sessionStorage.getItem(CHUNK_RELOAD_FLAG);
      if (!jaTentou) {
        // Só recarrega automaticamente na PRIMEIRA vez nesta sessão.
        // Se falhar de novo após o reload, cai no fallback normal de UI
        // em vez de continuar recarregando indefinidamente.
        window.sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
        window.location.reload();
        return;
      }
      // Segunda falha de chunk na mesma sessão: não tenta mais sozinho,
      // mostra a tela de erro normalmente para o usuário decidir.
    }

    if (!import.meta.env.DEV && typeof window.Sentry?.captureException === 'function') {
      window.Sentry.captureException(error, { extra: errorInfo });
    }
  }

  handleReset = () => {
    // Reset manual limpa a flag: se o usuário clicar em "Tentar novamente"
    // e o problema já tiver sido corrigido (novo deploy), um futuro erro
    // de chunk pode voltar a tentar reload automático uma vez.
    window.sessionStorage.removeItem(CHUNK_RELOAD_FLAG);
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-iluminus-fundo flex items-center justify-center p-4 text-center">
          <div className="max-w-md bg-white p-10 rounded-[40px] shadow-2xl border border-orange-100">
            <div className="bg-red-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-red-500" size={40} />
            </div>
            <h1 className="text-2xl font-black text-gray-800 mb-4">Ops! Algo deu errado.</h1>
            <p className="text-gray-500 mb-8">
              O sistema encontrou uma instabilidade inesperada. Não se preocupe, seus dados estão seguros.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={this.handleReset}
                className="bg-primary text-primary-foreground px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all"
              >
                <RefreshCw size={18} /> Tentar novamente
              </button>
              <button
                onClick={() => (window.location.href = '/')}
                className="text-gray-500 font-bold py-2 hover:text-gray-800 transition-colors flex items-center justify-center gap-2"
              >
                <Home size={16} /> Voltar para o Início
              </button>
            </div>
            {import.meta.env.DEV && (
              <div className="mt-8 p-4 bg-gray-50 rounded-xl text-left overflow-auto max-h-40">
                <p className="text-[10px] font-mono text-red-400">{this.state.error?.toString()}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;