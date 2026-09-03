// webapp/src/pages/UpgradePlano.jsx
//
// PED-115 — tela de upgrade self-service: escolhe plano (Essencial ou
// Profissional — "Rede" é sob consulta, fora deste fluxo), escolhe ciclo
// (mensal/anual), preenche cartão + dados do titular e assina. Acessível
// mesmo com o estúdio bloqueado por trial expirado (ver rota em App.jsx,
// mesmo padrão de /estudio-bloqueado) — é justamente a saída desse
// bloqueio.
//
// A confirmação definitiva da assinatura acontece de forma assíncrona via
// webhook (normalmente em segundos) — esta tela só mostra que o envio deu
// certo e redireciona; quem reflete o novo estado é o próximo carregamento
// de sessão (useAuth), igual ao resto do bloqueio por trial.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { assinarPlanoNexofy } from '../services/assinaturaNexofyService';
import { PLANOS_NEXOFY, resolverValorAssinatura } from '../lib/planosNexofy';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Input, { FormField } from '../components/ui/Input';
import Surface from '../components/ui/Surface';

const CARTAO_VAZIO = { holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '' };
const TITULAR_VAZIO = { name: '', email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' };

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

export default function UpgradePlano() {
  const { estudioId, nomeUsuario } = useAuth();
  const navigate = useNavigate();

  const [plano, setPlano] = useState('essencial');
  const [ciclo, setCiclo] = useState('mensal');
  const [cartao, setCartao] = useState(CARTAO_VAZIO);
  const [titular, setTitular] = useState({ ...TITULAR_VAZIO, name: nomeUsuario ?? '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const valor = resolverValorAssinatura(plano, ciclo);

  function atualizarCartao(campo, valorCampo) {
    setCartao((atual) => ({ ...atual, [campo]: valorCampo }));
  }

  function atualizarTitular(campo, valorCampo) {
    setTitular((atual) => ({ ...atual, [campo]: valorCampo }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!estudioId || enviando) return;

    setErro(null);
    setEnviando(true);
    try {
      await assinarPlanoNexofy({ estudioId, plano, ciclo, cartao, titular });
      showToast.success('Assinatura enviada! Confirmando o pagamento…');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[UpgradePlano] Erro ao assinar:', err);
      setErro(err?.message || 'Erro ao processar assinatura.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CreditCard size={28} className="text-primary" />
          </div>
          <h1 className="text-xl font-black text-foreground tracking-tight">Assinar plano Nexofy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Escolha o plano e informe o cartão pra continuar usando a Nexofy.</p>
        </div>

        <Surface className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plano</p>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(PLANOS_NEXOFY).map(([chave, config]) => (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => setPlano(chave)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      plano === chave ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <p className="font-bold text-foreground">{config.label}</p>
                    <p className="text-sm text-muted-foreground">{formatarMoeda(config.valorMensal)}/mês</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ciclo de cobrança</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCiclo('mensal')}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    ciclo === 'mensal' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <p className="font-bold text-foreground">Mensal</p>
                  <p className="text-sm text-muted-foreground">{formatarMoeda(resolverValorAssinatura(plano, 'mensal'))}/mês</p>
                </button>
                <button
                  type="button"
                  onClick={() => setCiclo('anual')}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    ciclo === 'anual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <p className="font-bold text-foreground">Anual</p>
                  <p className="text-sm text-muted-foreground">{formatarMoeda(resolverValorAssinatura(plano, 'anual'))}/ano — 2 meses grátis</p>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cartão de crédito</p>
              <FormField label="Nome impresso no cartão" required>
                <Input value={cartao.holderName} onChange={(e) => atualizarCartao('holderName', e.target.value)} required />
              </FormField>
              <FormField label="Número do cartão" required>
                <Input inputMode="numeric" value={cartao.number} onChange={(e) => atualizarCartao('number', e.target.value.replace(/\D/g, ''))} required />
              </FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Mês" required>
                  <Input inputMode="numeric" placeholder="MM" maxLength={2} value={cartao.expiryMonth} onChange={(e) => atualizarCartao('expiryMonth', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
                <FormField label="Ano" required>
                  <Input inputMode="numeric" placeholder="AAAA" maxLength={4} value={cartao.expiryYear} onChange={(e) => atualizarCartao('expiryYear', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
                <FormField label="CVV" required>
                  <Input inputMode="numeric" maxLength={4} value={cartao.ccv} onChange={(e) => atualizarCartao('ccv', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados do titular</p>
              <FormField label="Nome completo" required>
                <Input value={titular.name} onChange={(e) => atualizarTitular('name', e.target.value)} required />
              </FormField>
              <FormField label="E-mail" required>
                <Input type="email" value={titular.email} onChange={(e) => atualizarTitular('email', e.target.value)} required />
              </FormField>
              <FormField label="CPF ou CNPJ" required>
                <Input inputMode="numeric" value={titular.cpfCnpj} onChange={(e) => atualizarTitular('cpfCnpj', e.target.value.replace(/\D/g, ''))} required />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="CEP" required>
                  <Input inputMode="numeric" value={titular.postalCode} onChange={(e) => atualizarTitular('postalCode', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
                <FormField label="Número do endereço" required>
                  <Input value={titular.addressNumber} onChange={(e) => atualizarTitular('addressNumber', e.target.value)} required />
                </FormField>
              </div>
              <FormField label="Telefone" required>
                <Input inputMode="numeric" value={titular.phone} onChange={(e) => atualizarTitular('phone', e.target.value.replace(/\D/g, ''))} required />
              </FormField>
            </div>

            {erro && (
              <p className="text-sm font-medium text-destructive" role="alert">{erro}</p>
            )}

            <Button type="submit" fullWidth size="lg" loading={enviando} leftIcon={<CheckCircle2 size={18} />}>
              Assinar {PLANOS_NEXOFY[plano].label} — {formatarMoeda(valor)}
              {ciclo === 'anual' ? '/ano' : '/mês'}
            </Button>
          </form>
        </Surface>
      </div>
    </div>
  );
}
