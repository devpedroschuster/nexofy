// webapp/src/pages/PoliticaPrivacidade.jsx
//
// Rascunho público da Política de Privacidade. Mesmo racional do
// TermosDeUso.jsx: dá um destino real ao checkbox de consentimento do
// cadastro (PED-110) sem fingir que já existe um texto jurídico fechado.

import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileWarning } from 'lucide-react';
import { LINKS } from '../lib/constants';

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} /> Voltar para o Nexofy
        </Link>

        <h1 className="font-display mt-8 text-3xl font-bold tracking-tight">Política de Privacidade</h1>

        <div className="mt-6 flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4">
          <FileWarning size={18} className="text-warning shrink-0 mt-0.5" />
          <p className="text-sm text-warning leading-relaxed">
            Este é um rascunho. O texto definitivo (incluindo o detalhamento exigido pela LGPD)
            ainda está em revisão jurídica e pode mudar antes do lançamento. Dúvidas? Escreva
            para{' '}
            <a href={LINKS.CONTATO_COMERCIAL} className="font-semibold underline">
              contato@nexofy.com.br
            </a>.
          </p>
        </div>

        <div className="mt-10 space-y-8 text-sm text-foreground/80 leading-relaxed">
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">1. Quais dados coletamos</h2>
            <p className="mt-2">
              Dados de cadastro do responsável pelo estúdio (nome, e-mail) e, conforme o uso da
              plataforma, dados que você mesmo cadastra sobre o seu estúdio — alunos, planos,
              turmas, financeiro.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">2. Como usamos esses dados</h2>
            <p className="mt-2">
              Para operar a plataforma: autenticar seu acesso, calcular relatórios financeiros,
              enviar comunicações essenciais sobre a sua conta.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">3. Compartilhamento</h2>
            <p className="mt-2">
              Não vendemos seus dados nem os de seus alunos. Compartilhamento com terceiros,
              quando necessário para operar o serviço (ex. processador de pagamento), será
              detalhado aqui.
            </p>
          </section>
          <section>
            <h2 className="font-display text-lg font-bold text-foreground">4. Seus direitos (LGPD)</h2>
            <p className="mt-2">
              Você pode solicitar acesso, correção ou exclusão dos seus dados a qualquer momento,
              escrevendo para{' '}
              <a href={LINKS.CONTATO_COMERCIAL} className="font-semibold underline">
                contato@nexofy.com.br
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
