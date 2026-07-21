// src/pages/CadastroEstudio.jsx
// ─── Midnight Indigo · Cadastro (self-service, passo 2) ──────────────────────
//
// Roda depois que o usuário confirmou o e-mail (sessão já ativa).
// Coleta os dados do estúdio e chama a Edge Function `criar-meu-estudio`.
//
// Guard de acesso fica em App.jsx: exige sessão válida; se o usuário já
// tiver um estudio_membros, redireciona pra rota do perfil dele.
//
// Sucesso → recarrega a página em /dashboard (reload completo, não navigate)
// porque useAuth cacheia o perfil já resolvido por usuário — um navigate
// simples não dispararia a releitura de estudio_membros.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useId } from 'react';
import { Building2, Link2, Phone, Instagram, CheckCircle, XCircle } from 'lucide-react';

import { cadastroService } from '../services/cadastroService';
import { showToast } from '../components/shared/Toast';
import Input, { Label } from '../components/ui/Input';
import Button from '../components/ui/Button';

const SLUG_RE = /^[a-z0-9-]{3,50}$/;

function slugificar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

export default function CadastroEstudio() {
  const uid = useId();
  const [form, setForm] = useState({ nome: '', slug: '', whatsapp: '', instagram: '' });
  const [slugManual, setSlugManual] = useState(false);
  const [loading, setLoading] = useState(false);

  const slugValido = SLUG_RE.test(form.slug);
  const slugTocado  = form.slug.length > 0;

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function handleNomeChange(e) {
    const nome = e.target.value;
    set('nome', nome);
    if (!slugManual) set('slug', slugificar(nome));
  }

  function handleSlugChange(e) {
    setSlugManual(true);
    set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (loading) return;

    if (!form.nome.trim()) {
      showToast.error('Digite o nome do seu estúdio.');
      return;
    }
    if (!slugValido) {
      showToast.error('Slug inválido. Use letras minúsculas, números e hífens (3–50 chars).');
      return;
    }

    setLoading(true);
    try {
      await cadastroService.criarMeuEstudio({
        nome: form.nome,
        slug: form.slug,
        whatsapp: form.whatsapp,
        instagram: form.instagram,
      });

      showToast.success('Estúdio criado! Preparando seu painel...');
      // Reload completo — useAuth precisa reler estudio_membros do zero.
      window.location.href = '/dashboard';
    } catch (err) {
      showToast.error(err.message || 'Erro ao criar estúdio.');
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-4 overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: 'var(--gradient-hero)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="bg-card border border-border rounded-2xl shadow-card p-8 space-y-7">

          <div className="text-center space-y-3">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-elegant">
              <Building2 size={24} className="text-primary-foreground" strokeWidth={2} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-semibold text-foreground tracking-tight">
                Agora, seu estúdio
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Só mais alguns dados e seu painel já fica pronto.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <Label htmlFor={`${uid}-nome`} required>Nome do estúdio</Label>
              <Input
                id={`${uid}-nome`}
                leftIcon={<Building2 size={16} />}
                placeholder="Ex: Espaço Movimento"
                value={form.nome}
                onChange={handleNomeChange}
                required
                disabled={loading}
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor={`${uid}-slug`} required>Slug (URL única)</Label>
              <Input
                id={`${uid}-slug`}
                leftIcon={<Link2 size={16} />}
                rightIcon={
                  slugTocado
                    ? slugValido
                      ? <CheckCircle size={16} className="text-success" />
                      : <XCircle size={16} className="text-destructive" />
                    : null
                }
                placeholder="espaco-movimento"
                value={form.slug}
                onChange={handleSlugChange}
                required
                disabled={loading}
                aria-describedby={`${uid}-slug-hint`}
              />
              <p id={`${uid}-slug-hint`} className="mt-1 text-[11px] text-muted-foreground">
                Apenas letras minúsculas, números e hífens · 3–50 caracteres
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${uid}-whats`}>WhatsApp</Label>
                <Input
                  id={`${uid}-whats`}
                  leftIcon={<Phone size={16} />}
                  placeholder="51 9 9999-0000"
                  value={form.whatsapp}
                  onChange={(e) => set('whatsapp', e.target.value)}
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor={`${uid}-insta`}>Instagram</Label>
                <Input
                  id={`${uid}-insta`}
                  leftIcon={<Instagram size={16} />}
                  placeholder="@estudio"
                  value={form.instagram}
                  onChange={(e) => set('instagram', e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="submit"
              variant="premium"
              size="lg"
              fullWidth
              loading={loading}
              leftIcon={<Building2 size={16} />}
            >
              {loading ? 'Criando...' : 'Criar meu estúdio'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}