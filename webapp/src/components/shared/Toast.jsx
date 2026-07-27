// src/components/shared/Toast.jsx
import React from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import { useTheme } from '../../providers/ThemeProvider';

export function ToastProvider() {
  const { resolvedTheme } = useTheme(); // BUG-01: usar o tema resolvido, não a preferência 'system'
  const isDark = resolvedTheme === 'dark';

  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: isDark ? '#1C1C1C' : '#fff',
          color: isDark ? '#E4E4E7' : '#2D2D2D',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: isDark ? '0 10px 40px rgba(0,0,0,0.5)' : '0 10px 40px rgba(0,0,0,0.1)',
          border: isDark ? '1px solid #3F3F46' : '1px solid #F0E5DE',
          maxWidth: '400px',
          transition: 'all 0.2s ease-in-out',
        },
        success: {
          iconTheme: { primary: '#10B981', secondary: isDark ? '#1C1C1C' : '#fff' },
        },
        error: {
          iconTheme: { primary: '#EF4444', secondary: isDark ? '#1C1C1C' : '#fff' },
        },
      }}
    />
  );
}

function safeMessage(mensagem, fallback) {
  if (typeof mensagem === 'string' && mensagem.trim().length > 0) return mensagem;
  return fallback;
}

export const showToast = {
  success: (mensagem, opcoes = {}) => {
    toast.success(safeMessage(mensagem, 'Concluído com sucesso.'), {
      icon: <CheckCircle size={20} className="text-green-500" />,
      ...opcoes,
    });
  },

  error: (mensagem, opcoes = {}) => {
    toast.error(safeMessage(mensagem, 'Ocorreu um erro. Tente novamente.'), {
      icon: <XCircle size={20} className="text-red-500" />,
      ...opcoes,
    });
  },

  warning: (mensagem, opcoes = {}) => {
    toast(safeMessage(mensagem, 'Atenção necessária.'), {
      icon: <AlertCircle size={20} className="text-yellow-500" />,
      ...opcoes,
    });
  },

  info: (mensagem, opcoes = {}) => {
    toast(safeMessage(mensagem, 'Informação.'), {
      icon: <Info size={20} className="text-blue-500" />,
      ...opcoes,
    });
  },

  custom: (mensagem, onAction, textoAcao = 'Desfazer') => {
    toast((t) => (
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{safeMessage(mensagem, '')}</span>
        <button
          onClick={() => {
            if (typeof onAction === 'function') {
              onAction();
            } else {
              console.warn('[showToast.custom] onAction não fornecido ou não é uma função.');
            }
            toast.dismiss(t.id);
          }}
          className="text-primary font-bold text-sm hover:underline"
        >
          {textoAcao}
        </button>
      </div>
    ), {
      duration: 5000,
    });
  },

  promise: (promise, mensagens = {}) => {
    if (!promise || typeof promise.then !== 'function') {
      console.error('[showToast.promise] Argumento inválido: esperado uma Promise.', promise);
      return promise;
    }
    return toast.promise(promise, {
      loading: mensagens.loading || 'Processando...',
      success: mensagens.success || 'Concluído com sucesso!',
      error: mensagens.error || 'Erro ao processar.',
    });
  },
};