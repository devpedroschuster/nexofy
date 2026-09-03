// webapp/src/pages/TermosDeUso.jsx
//
// Rascunho público dos Termos de Uso. Existe pra dar um destino real ao
// link/checkbox de consentimento do cadastro (PED-110) — o texto definitivo
// ainda depende de revisão jurídica, então a página é honesta sobre isso
// em vez de fingir ser um contrato fechado.

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { LINKS, DOCUMENTOS_LEGAIS } from '../lib/constants';

export default function TermosDeUso() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} /> Voltar para o Nexofy
        </Link>

        <h1 className="font-display mt-8 text-3xl font-bold tracking-tight">Termos de Uso</h1>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          Versão {DOCUMENTOS_LEGAIS.TERMOS.versao} · vigente desde{' '}
          {new Date(`${DOCUMENTOS_LEGAIS.TERMOS.vigenteDesde}T00:00:00`).toLocaleDateString('pt-BR')}
        </p>

        <div className="mt-6 flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4">
          <FileWarning size={18} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-warning leading-relaxed">
            Este é um rascunho. O texto definitivo ainda está em revisão jurídica e pode mudar
            antes do lançamento. Dúvidas? Escreva para{' '}
            <a href={LINKS.CONTATO_COMERCIAL} className="font-semibold underline">
              contato@nexofy.com.br
            </a>.
          </p>
        </div>

        <div className="mt-10 space-y-8 text-sm text-foreground/80 leading-relaxed">
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">1. O que é o Nexofy</h2>
            <p className="mt-2">
              O Nexofy é uma plataforma de gestão para estúdios, boxes e personal trainers —
              agenda, alunos e financeiro. Ao criar uma conta, você está contratando o uso do
              software nas condições descritas aqui.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">2. Sua conta</h2>
            <p className="mt-2">
              Você é responsável por manter suas credenciais em sigilo e pelas ações realizadas
              na sua conta e no seu estúdio.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">3. Teste grátis e cobrança</h2>
            <p className="mt-2">
              Novas contas têm um período de teste grátis, sem necessidade de cartão de crédito.
              As condições exatas de cobrança após o teste serão detalhadas aqui antes do
              lançamento oficial.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">4. Dados dos seus alunos — papéis e responsabilidades</h2>
            <p className="mt-2">
              Sobre os dados que você cadastra a respeito dos seus alunos, o seu estúdio é o{' '}
              <strong>controlador</strong> (decide o quê e por quê coletar) e o Nexofy é o{' '}
              <strong>operador</strong> (trata o dado só para operar a plataforma, seguindo as
              suas instruções). Isso significa que o Nexofy: (i) trata esses dados apenas para
              prestar o serviço contratado; (ii) aplica medidas de segurança razoáveis para
              protegê-los; (iii) ajuda o seu estúdio a responder pedidos de titulares (acesso,
              correção, exclusão) sobre os dados dos seus alunos; (iv) exclui ou devolve os
              dados ao final do contrato, salvo obrigação legal de retenção.
            </p>
            <p className="mt-2">
              Como controlador, é seu estúdio quem deve ter base legal e, quando aplicável,
              consentimento específico do aluno para os dados que cadastra — isso vale em
              especial para dado sensível, como observações médicas e anamnese (ver{' '}
              <Link to={LINKS.PRIVACIDADE} className="font-semibold underline">
                Política de Privacidade
              </Link>).
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">5. Cancelamento</h2>
            <p className="mt-2">
              Você pode cancelar sua conta quando quiser, sem taxa de cancelamento.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
