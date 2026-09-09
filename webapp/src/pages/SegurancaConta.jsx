// webapp/src/pages/SegurancaConta.jsx
// PED-175 (achado de auditoria LGPD): contas de dono/admin de estúdio
// administram dado sensível de saúde e dado financeiro de terceiros — MFA
// ausente (supabase/config.toml tinha enroll_enabled=false) era um risco
// desproporcional. Esta página é o self-service de enrollment TOTP —
// habilitação em si é opcional/incentivada (ver NudgeMfa.jsx), não
// bloqueante. O desafio de login (aal2) para quem já tem fator verificado
// é tratado em Login.jsx.
import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/shared/Toast';
import Surface from '../components/ui/Surface';
import Button from '../components/ui/Button';
import Input, { FormField } from '../components/ui/Input';

export default function SegurancaConta() {
  const [factors, setFactors] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [inscrevendo, setInscrevendo] = useState(false);
  const [enrollment, setEnrollment] = useState(null); // { factorId, qrCode, secret }
  const [codigo, setCodigo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);

  async function carregarFactors() {
    setCarregando(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFactors(data.totp ?? []);
    } catch (error) {
      console.error('[SegurancaConta] Erro ao carregar fatores:', error);
      showToast.error('Não foi possível carregar seus fatores de segurança.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarFactors(); }, []);

  async function iniciarEnrollment() {
    setInscrevendo(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (error) {
      console.error('[SegurancaConta] Erro ao iniciar enrollment:', error);
      showToast.error('Não foi possível iniciar a ativação. Tente novamente.');
    } finally {
      setInscrevendo(false);
    }
  }

  async function confirmarEnrollment(e) {
    e.preventDefault();
    if (!enrollment || codigo.trim().length !== 6) return;

    setConfirmando(true);
    try {
      const { data: challenge, error: erroChallenge } = await supabase.auth.mfa.challenge({
        factorId: enrollment.factorId,
      });
      if (erroChallenge) throw erroChallenge;

      const { error: erroVerify } = await supabase.auth.mfa.verify({
        factorId: enrollment.factorId,
        challengeId: challenge.id,
        code: codigo.trim(),
      });
      if (erroVerify) throw erroVerify;

      showToast.success('Autenticação de dois fatores ativada!');
      setEnrollment(null);
      setCodigo('');
      await carregarFactors();
    } catch (error) {
      console.error('[SegurancaConta] Erro ao confirmar código:', error);
      showToast.error('Código inválido ou expirado. Tente novamente.');
    } finally {
      setConfirmando(false);
    }
  }

  async function cancelarEnrollment() {
    if (enrollment) {
      await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId }).catch(() => {});
    }
    setEnrollment(null);
    setCodigo('');
  }

  async function removerFator(factorId) {
    if (!window.confirm('Remover a autenticação de dois fatores desta conta?')) return;
    setRemovendoId(factorId);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      showToast.success('Autenticação de dois fatores removida.');
      await carregarFactors();
    } catch (error) {
      console.error('[SegurancaConta] Erro ao remover fator:', error);
      showToast.error('Não foi possível remover agora. Tente novamente.');
    } finally {
      setRemovendoId(null);
    }
  }

  const fatorVerificado = (factors ?? []).find((f) => f.status === 'verified');

  return (
    <div className="p-8 space-y-8 max-w-2xl animate-in fade-in">
      <div>
        <h1 className="text-3xl font-black text-foreground">Segurança da Conta</h1>
        <p className="text-muted-foreground">
          Ative a autenticação de dois fatores (TOTP) para proteger sua conta com uma camada
          extra de segurança — recomendado para quem administra dados de alunos.
        </p>
      </div>

      {carregando && <p className="text-muted-foreground font-medium">Carregando...</p>}

      {!carregando && fatorVerificado && !enrollment && (
        <Surface variant="card" padding="lg" className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-success" size={24} />
            <div>
              <p className="font-black text-foreground">Autenticação de dois fatores ativa</p>
              <p className="text-sm text-muted-foreground">
                Adicionada em {new Date(fatorVerificado.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={removendoId === fatorVerificado.id}
            onClick={() => removerFator(fatorVerificado.id)}
          >
            <ShieldOff size={14} /> Remover
          </Button>
        </Surface>
      )}

      {!carregando && !fatorVerificado && !enrollment && (
        <Surface variant="card" padding="lg" className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Você ainda não tem autenticação de dois fatores ativada nesta conta.
          </p>
          <Button variant="brand" loading={inscrevendo} onClick={iniciarEnrollment}>
            <ShieldCheck size={16} /> Ativar autenticação de dois fatores
          </Button>
        </Surface>
      )}

      {enrollment && (
        <Surface variant="card" padding="lg" className="space-y-4">
          <p className="text-sm font-medium text-foreground">
            1. Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, 1Password, etc.)
          </p>
          <img src={enrollment.qrCode} alt="QR code para ativar autenticação de dois fatores" className="mx-auto h-48 w-48" />
          <div className="flex items-center gap-2 justify-center">
            <code className="bg-muted px-2 py-1 rounded text-xs">{enrollment.secret}</code>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                navigator.clipboard.writeText(enrollment.secret);
                showToast.success('Código copiado.');
              }}
              aria-label="Copiar código secreto"
            >
              <Copy size={14} />
            </Button>
          </div>

          <form onSubmit={confirmarEnrollment} className="space-y-3">
            <FormField label="2. Digite o código de 6 dígitos gerado pelo app" htmlFor="codigo-mfa">
              <Input
                id="codigo-mfa"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </FormField>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={cancelarEnrollment}>Cancelar</Button>
              <Button type="submit" variant="brand" loading={confirmando} disabled={codigo.length !== 6}>
                Confirmar
              </Button>
            </div>
          </form>
        </Surface>
      )}
    </div>
  );
}
