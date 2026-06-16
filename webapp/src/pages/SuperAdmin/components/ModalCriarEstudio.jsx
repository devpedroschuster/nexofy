// webapp/src/pages/SuperAdmin/components/ModalCriarEstudio.jsx

import React, { useState, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Link2, Mail, User, Phone, Instagram, RefreshCw, CheckCircle, XCircle,
} from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import Input, { Label } from '../../../components/ui/Input';
import { showToast } from '../../../components/shared/Toast';
import { superAdminService } from '../../../services/superAdminService';

// Slug: apenas letras minúsculas, dígitos e hífens, 3–50 caracteres.
const SLUG_RE = /^[a-z0-9-]{3,50}$/;

function slugificar(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove acentos
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

export default function ModalCriarEstudio({ aberto, fechar }) {
  const uid     = useId();
  const qc      = useQueryClient();
  const [form, setForm] = useState(FORM_VAZIO);
  const [slugManual, setSlugManual] = useState(false); // true quando o usuário edita o slug manualmente

  const slugValido = SLUG_RE.test(form.slug);
  const slugTocado = form.slug.length > 0;

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function handleNomeChange(e) {
    const nome = e.target.value;
    set('nome', nome);
    // Auto-gera slug a partir do nome enquanto o usuário não editar manualmente
    if (!slugManual) {
      set('slug', slugificar(nome));
    }
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
        whatsapp:   form.whatsapp.trim() || undefined,
        instagram:  form.instagram.trim() || undefined,
      }),
    onSuccess: (data) => {
      showToast.success(`Estúdio "${data.estudio.nome}" criado com sucesso!`);
      qc.invalidateQueries({ queryKey: ['super-admin'] });
      setForm(FORM_VAZIO);
      setSlugManual(false);
      fechar();
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

  function handleFechar() {
    if (isPending) return;
    setForm(FORM_VAZIO);
    setSlugManual(false);
    fechar();
  }

  return (
    <Modal aberto={aberto} fechar={handleFechar} title="Criar novo estúdio" size="md">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Dados do estúdio ── */}
        <fieldset className="space-y-4">
          <legend className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3">
            Estúdio
          </legend>

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
            <Label htmlFor={`${uid}-slug`} required>
              Slug (URL única)
            </Label>
            <div className="relative">
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
                disabled={isPending}
                aria-describedby={`${uid}-slug-hint`}
              />
            </div>
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
        </fieldset>

        {/* ── Divisor ── */}
        <div className="border-t border-border" />

        {/* ── Admin responsável ── */}
        <fieldset className="space-y-4">
          <legend className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 mb-3">
            Admin responsável
          </legend>

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
        </fieldset>

        <Modal.Footer>
          <Button variant="ghost" type="button" onClick={handleFechar} disabled={isPending}>
            Cancelar
          </Button>
          <Button variant="brand" type="submit" loading={isPending} leftIcon={<Building2 size={16} />}>
            {isPending ? 'Criando…' : 'Criar estúdio'}
          </Button>
        </Modal.Footer>
      </form>
    </Modal>
  );
}