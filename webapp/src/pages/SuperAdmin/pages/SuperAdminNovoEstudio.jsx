// webapp/src/pages/SuperAdmin/pages/SuperAdminNovoEstudio.jsx
//
// Rota: /super/estudios/novo
// Formulário de criação de estúdio em página própria (não modal).
// Após sucesso redireciona para /super/estudios.

import React, { useState, useId } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Link2, Mail, User, Phone, Instagram,
  CheckCircle, XCircle, ArrowLeft,
} from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input, { Label } from '../../../components/ui/Input';
import Surface from '../../../components/ui/Surface';
import { showToast } from '../../../components/shared/Toast';
import { superAdminService } from '../../../services/superAdminService';

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

const FORM_VAZIO = {
  nome: '',
  slug: '',
  adminEmail: '',
  adminNome: '',
  whatsapp: '',
  instagram: '',
};

export default function SuperAdminNovoEstudio() {
  const uid      = useId();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [form, setForm]           = useState(FORM_VAZIO);
  const [slugManual, setSlugManual] = useState(false);

  const slugValido = SLUG_RE.test(form.slug);
  const slugTocado = form.slug.length > 0;

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

  const { mutate: criar, isPending } = useMutation({
    mutationFn: () =>
      superAdminService.criarEstudio({
        nome:       form.nome.trim(),
        slug:       form.slug.trim(),
        adminEmail: form.adminEmail.trim(),
        adminNome:  form.adminNome.trim(),
        whatsapp:   form.whatsapp.trim()   || undefined,
        instagram:  form.instagram.trim()  || undefined,
      }),
    onSuccess: (data) => {
      showToast.success(`Estúdio "${data.estudio.nome}" criado com sucesso!`);
      qc.invalidateQueries({ queryKey: ['super-admin'] });
      navigate('/super/estudios');
    },
    onError: (err) => {
      showToast.error(err.message || 'Erro ao criar estúdio.');
    },
  });

  function handleSubmit(e) {
    e.preventDefault();
    if (!slugValido) {
      showToast.error('Slug inválido. Use letras minúsculas, números e hífens (3–50 chars).');
      return;
    }
    criar();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb / voltar */}
      <div className="flex items-center gap-3">
        <Button
          as={Link}
          to="/super/estudios"
          variant="ghost"
          size="sm"
          leftIcon={<ArrowLeft size={16} />}
          disabled={isPending}
        >
          Voltar
        </Button>
        <div className="h-4 w-px bg-border" />
        <div>
          <p className="text-xs text-muted-foreground font-medium">
            Estúdios
          </p>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Criar novo estúdio</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Preencha os dados abaixo. O admin receberá um e-mail com link de acesso automaticamente.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Dados do estúdio ── */}
        <Surface variant="card" padding="lg" className="space-y-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Dados do estúdio
          </p>

          <div>
            <Label htmlFor={`${uid}-nome`} required>Nome do estúdio</Label>
            <Input
              id={`${uid}-nome`}
              leftIcon={<Building2 size={16} />}
              placeholder="Ex: Espaço Movimento"
              value={form.nome}
              onChange={handleNomeChange}
              required
              disabled={isPending}
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
                    : <XCircle    size={16} className="text-destructive" />
                  : null
              }
              placeholder="espaco-movimento"
              value={form.slug}
              onChange={handleSlugChange}
              required
              disabled={isPending}
              aria-describedby={`${uid}-slug-hint`}
            />
            <p id={`${uid}-slug-hint`} className="mt-1 text-[11px] text-muted-foreground">
              Apenas letras minúsculas, números e hífens · 3–50 caracteres
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`${uid}-whats`}>WhatsApp</Label>
              <Input
                id={`${uid}-whats`}
                leftIcon={<Phone size={16} />}
                placeholder="51 9 9999-0000"
                value={form.whatsapp}
                onChange={(e) => set('whatsapp', e.target.value)}
                disabled={isPending}
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
                disabled={isPending}
              />
            </div>
          </div>
        </Surface>

        {/* ── Admin responsável ── */}
        <Surface variant="card" padding="lg" className="space-y-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Admin responsável
          </p>

          <div>
            <Label htmlFor={`${uid}-adminNome`} required>Nome completo</Label>
            <Input
              id={`${uid}-adminNome`}
              leftIcon={<User size={16} />}
              placeholder="Maria Fernanda"
              value={form.adminNome}
              onChange={(e) => set('adminNome', e.target.value)}
              required
              disabled={isPending}
            />
          </div>

          <div>
            <Label htmlFor={`${uid}-adminEmail`} required>E-mail de acesso</Label>
            <Input
              id={`${uid}-adminEmail`}
              type="email"
              leftIcon={<Mail size={16} />}
              placeholder="maria@estudio.com.br"
              value={form.adminEmail}
              onChange={(e) => set('adminEmail', e.target.value)}
              required
              disabled={isPending}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Um link de acesso será enviado automaticamente para este e-mail.
            </p>
          </div>
        </Surface>

        {/* ── Ações ── */}
        <div className="flex items-center justify-end gap-3">
          <Button
            as={Link}
            to="/super/estudios"
            variant="ghost"
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="brand"
            loading={isPending}
            leftIcon={<Building2 size={16} />}
          >
            {isPending ? 'Criando…' : 'Criar estúdio'}
          </Button>
        </div>
      </form>
    </div>
  );
}