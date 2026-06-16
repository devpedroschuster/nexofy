// webapp/src/pages/ConfiguracoesEstudio.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Settings, Upload, Save, Globe, Phone, Instagram, MapPin, Mail, Palette } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEstudio } from '../hooks/useEstudio';
import { useAuth } from '../hooks/useAuth';
import { atualizarEstudio, uploadLogo } from '../services/estudioService';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Input, { Label } from '../components/ui/Input';
import Surface from '../components/ui/Surface';

// Timezones brasileiras + internacionais mais comuns
const TIMEZONES = [
  { value: 'America/Sao_Paulo',    label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus',       label: 'Manaus (GMT-4)' },
  { value: 'America/Belem',        label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza',    label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife',       label: 'Recife (GMT-3)' },
  { value: 'America/Bahia',        label: 'Salvador (GMT-3)' },
  { value: 'America/Cuiaba',       label: 'Cuiabá (GMT-4)' },
  { value: 'America/Porto_Velho',  label: 'Porto Velho (GMT-4)' },
  { value: 'America/Boa_Vista',    label: 'Boa Vista (GMT-4)' },
  { value: 'America/Rio_Branco',   label: 'Rio Branco (GMT-5)' },
  { value: 'America/Noronha',      label: 'Fernando de Noronha (GMT-2)' },
  { value: 'America/New_York',     label: 'Nova York (GMT-5)' },
  { value: 'Europe/Lisbon',        label: 'Lisboa (GMT+0/+1)' },
  { value: 'UTC',                  label: 'UTC' },
];

function FieldGroup({ children, className = '' }) {
  return <div className={`space-y-1.5 ${className}`}>{children}</div>;
}

export default function ConfiguracoesEstudio() {
  const queryClient = useQueryClient();
  const { estudioId } = useAuth();
  const { data: estudio, isLoading } = useEstudio();

  const fileInputRef = useRef(null);
  const [salvando, setSalvando] = useState(false);
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const [previewLogo, setPreviewLogo] = useState(null);

  const [form, setForm] = useState({
    nome:           '',
    whatsapp:       '',
    instagram_url:  '',
    maps_url:       '',
    email_suporte:  '',
    cor_primaria:   '#7c3aed',
    timezone:       'America/Sao_Paulo',
  });

  // Preenche o form quando os dados do estúdio chegam
  useEffect(() => {
    if (!estudio) return;
    setForm({
      nome:          estudio.nome          ?? '',
      whatsapp:      estudio.whatsapp      ?? '',
      instagram_url: estudio.instagram_url ?? '',
      maps_url:      estudio.maps_url      ?? '',
      email_suporte: estudio.email_suporte ?? '',
      cor_primaria:  estudio.cor_primaria  ?? '#7c3aed',
      timezone:      estudio.timezone      ?? 'America/Sao_Paulo',
    });
    setPreviewLogo(estudio.logo_url ?? null);
  }, [estudio]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSalvar() {
    if (!form.nome.trim()) {
      showToast.error('O nome do estúdio é obrigatório.');
      return;
    }

    setSalvando(true);
    try {
      await atualizarEstudio(estudioId, form);
      // Invalida a query para refletir imediatamente no Sidebar e demais componentes
      await queryClient.invalidateQueries({ queryKey: ['estudio-atual'] });
      showToast.success('Configurações salvas com sucesso!');
    } catch (err) {
      console.error(err);
      showToast.error('Erro ao salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview local imediato
    setPreviewLogo(URL.createObjectURL(file));

    setUploadandoLogo(true);
    try {
      const url = await uploadLogo(estudioId, file);
      setPreviewLogo(url);
      // Invalida para que o Sidebar reflita o novo logo
      await queryClient.invalidateQueries({ queryKey: ['estudio-atual'] });
      showToast.success('Logo atualizado com sucesso!');
    } catch (err) {
      console.error(err);
      showToast.error('Erro ao enviar o logo. Tente novamente.');
      setPreviewLogo(estudio?.logo_url ?? null);
    } finally {
      setUploadandoLogo(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded-2xl w-64" />
          <div className="h-4 bg-muted rounded-xl w-96" />
          <div className="h-64 bg-muted rounded-3xl mt-8" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8 animate-in fade-in space-y-8">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
          <Settings className="text-primary" />
          Configurações do Estúdio
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Personalize as informações, identidade visual e contato do seu estúdio.
        </p>
      </div>

      {/* Logo */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Upload size={18} className="text-primary" />
          Logo do Estúdio
        </h2>

        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-3xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
              {previewLogo ? (
                <img
                  src={previewLogo}
                  alt="Logo do estúdio"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-black text-primary">
                  {form.nome?.charAt(0)?.toUpperCase() ?? 'E'}
                </span>
              )}
            </div>
            {uploadandoLogo && (
              <div className="absolute inset-0 rounded-3xl bg-black/40 flex items-center justify-center">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleLogoChange}
            />
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Upload size={16} />}
              onClick={() => fileInputRef.current?.click()}
              loading={uploadandoLogo}
            >
              {uploadandoLogo ? 'Enviando...' : 'Escolher imagem'}
            </Button>
            <p className="text-xs text-muted-foreground font-medium">
              PNG, JPG ou SVG. Recomendado: 512×512 px.
            </p>
          </div>
        </div>
      </Surface>

      {/* Informações básicas */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          Informações Básicas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup className="md:col-span-2">
            <Label htmlFor="nome" required>Nome do Estúdio</Label>
            <Input
              id="nome"
              name="nome"
              value={form.nome}
              onChange={handleChange}
              placeholder="Ex: Espaço Iluminus"
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="timezone">Fuso Horário</Label>
            <Input
              as="select"
              id="timezone"
              name="timezone"
              value={form.timezone}
              onChange={handleChange}
              className="font-medium"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </Input>
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="cor_primaria" className="flex items-center gap-1.5">
              <Palette size={12} />
              Cor Primária
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="cor_primaria"
                name="cor_primaria"
                value={form.cor_primaria}
                onChange={handleChange}
                className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-input p-1"
              />
              <Input
                name="cor_primaria"
                value={form.cor_primaria}
                onChange={handleChange}
                placeholder="#7c3aed"
                className="font-mono"
              />
            </div>
          </FieldGroup>
        </div>
      </Surface>

      {/* Contato */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Phone size={18} className="text-primary" />
          Contato e Redes Sociais
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup>
            <Label htmlFor="whatsapp">WhatsApp de Suporte</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              value={form.whatsapp}
              onChange={handleChange}
              placeholder="5551999999999"
              leftIcon={<Phone size={16} />}
            />
            <p className="text-[11px] text-muted-foreground font-medium">
              Formato: código do país + DDD + número (sem espaços).
            </p>
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="email_suporte">E-mail de Suporte</Label>
            <Input
              id="email_suporte"
              name="email_suporte"
              type="email"
              value={form.email_suporte}
              onChange={handleChange}
              placeholder="contato@meuestudio.com"
              leftIcon={<Mail size={16} />}
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="instagram_url">Instagram</Label>
            <Input
              id="instagram_url"
              name="instagram_url"
              value={form.instagram_url}
              onChange={handleChange}
              placeholder="https://instagram.com/meuestudio"
              leftIcon={<Instagram size={16} />}
            />
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="maps_url">Google Maps URL</Label>
            <Input
              id="maps_url"
              name="maps_url"
              value={form.maps_url}
              onChange={handleChange}
              placeholder="https://maps.google.com/..."
              leftIcon={<MapPin size={16} />}
            />
          </FieldGroup>
        </div>
      </Surface>

      {/* Botão salvar */}
      <div className="flex justify-end pb-4">
        <Button
          variant="brand"
          size="lg"
          leftIcon={<Save size={20} />}
          onClick={handleSalvar}
          loading={salvando}
        >
          {salvando ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
    </div>
  );
}