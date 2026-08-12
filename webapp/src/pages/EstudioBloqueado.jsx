// webapp/src/pages/EstudioBloqueado.jsx
//
// Tela exibida quando o usuário logado (admin/professor) pertence a um
// estúdio cujo `status` não é 'ativo' (inativo, suspenso ou cancelado).
// A resolução vem do AuthContext (useAuth) via RPC verificar_status_estudio,
// que roda SECURITY DEFINER e por isso funciona mesmo com o estúdio
// bloqueado no RLS (meu_estudio_id()/estudio_id_atual() retornam null
// nesse cenário, cortando todo o resto dos dados em cascata).
//
// super_admin NUNCA cai aqui: ele acessa qualquer estúdio via
// impersonation (estudio_ativo_via_override()), que é um caminho à parte.

import React from 'react';
import { AlertTriangle, LogOut, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';

const MENSAGENS_POR_STATUS = {
  inativo: {
    titulo: 'Estúdio inativo',
    descricao:
      'O acesso a este estúdio está temporariamente pausado. Se você acredita que isso é um engano, entre em contato com o suporte.',
  },
  suspenso: {
    titulo: 'Estúdio suspenso',
    descricao:
      'O acesso a este estúdio foi suspenso pela administração da plataforma. Entre em contato com o suporte para regularizar a situação.',
  },
  cancelado: {
    titulo: 'Estúdio encerrado',
    descricao:
      'Este estúdio foi encerrado e não está mais disponível. Entre em contato com o suporte se precisar de mais informações.',
  },
};

const MENSAGEM_PADRAO = {
  titulo: 'Acesso indisponível',
  descricao:
    'Não foi possível liberar o acesso a este estúdio no momento. Entre em contato com o suporte.',
};

export default function EstudioBloqueado() {
  const { estudioStatusInfo, nomeUsuario } = useAuth();

  const status = estudioStatusInfo?.status;
  const nomeEstudio = estudioStatusInfo?.nome ?? 'seu estúdio';
  const { titulo, descricao } = MENSAGENS_POR_STATUS[status] ?? MENSAGEM_PADRAO;

  async function handleSair() {
    await supabase.auth.signOut();
    // O AppRoutes reage à mudança de sessão e redireciona pro /login sozinho.
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card shadow-card p-8 text-center">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-warning-soft flex items-center justify-center">
          <AlertTriangle size={28} className="text-warning" />
        </div>

        <h1 className="text-xl font-black text-foreground tracking-tight">{titulo}</h1>

        <p className="mt-2 text-sm font-bold text-muted-foreground">{nomeEstudio}</p>

        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{descricao}</p>

        {nomeUsuario && (
          <p className="mt-4 text-xs text-muted-foreground">
            Conectado como <span className="font-bold text-foreground">{nomeUsuario}</span>
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <a
            href="mailto:suporte@nexofy.app"
            className="inline-flex items-center justify-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <Mail size={15} />
            Falar com o suporte
          </a>

          <Button variant="ghost" onClick={handleSair} className="w-full">
            <LogOut size={16} className="mr-2" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}