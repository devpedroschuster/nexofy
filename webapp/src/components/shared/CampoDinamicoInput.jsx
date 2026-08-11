// webapp/src/components/shared/CampoDinamicoInput.jsx
//
// Dado um item do catálogo `campos_dinamicos` (ver camposDinamicosService),
// renderiza o input correto e conecta ao valor/onChange fornecidos pelo
// componente pai. Não sabe nada sobre "aluno" ou "metadata" — é genérico o
// suficiente para reaproveitar em outras entidades no futuro (ex.: agenda).
//
// Reaproveita Input/Label/FormField já existentes — não introduz nenhuma
// biblioteca de input nova.

import React from 'react';
import Input, { FormField } from '../ui/Input';

/**
 * @param {object} props
 * @param {{ id: string, field_name: string, label: string, field_type: string,
 *           opcoes?: string[], is_required?: boolean }} props.campo
 * @param {*} props.valor
 * @param {(novoValor: any) => void} props.onChange
 * @param {string} [props.error]
 */
export default function CampoDinamicoInput({ campo, valor, onChange, error }) {
  const id = `campo-dinamico-${campo.field_name}`;

  if (campo.field_type === 'boolean') {
    return (
      <label htmlFor={id} className="flex items-center gap-2.5 py-1 cursor-pointer select-none">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(valor)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-sm font-medium text-foreground">
          {campo.label}
          {campo.is_required && <span className="text-destructive"> *</span>}
        </span>
      </label>
    );
  }

  if (campo.field_type === 'select') {
    return (
      <FormField label={campo.label} htmlFor={id} required={campo.is_required} error={error}>
        <Input
          as="select"
          id={id}
          value={valor ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Selecionar...</option>
          {(campo.opcoes ?? []).map((opcao) => (
            <option key={opcao} value={opcao}>{opcao}</option>
          ))}
        </Input>
      </FormField>
    );
  }

  if (campo.field_type === 'file') {
    // Upload em si (Supabase Storage) fica fora do escopo deste componente —
    // aqui só capturamos a referência/URL já resolvida pelo chamador.
    // Mantido simples de propósito: o item 1 do plano cobre o catálogo de
    // campos, não um módulo de upload de arquivo.
    return (
      <FormField label={campo.label} htmlFor={id} required={campo.is_required} error={error}>
        <Input
          id={id}
          type="file"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </FormField>
    );
  }

  // 'number' e 'text' (default)
  return (
    <FormField label={campo.label} htmlFor={id} required={campo.is_required} error={error}>
      <Input
        id={id}
        type={campo.field_type === 'number' ? 'number' : 'text'}
        value={valor ?? ''}
        onChange={(e) => onChange(campo.field_type === 'number'
          ? (e.target.value === '' ? '' : Number(e.target.value))
          : e.target.value)}
      />
    </FormField>
  );
}

/**
 * Lista de campos dinâmicos ativos, já plugados a um objeto `metadata` +
 * setter — poupa o componente pai de escrever o .map() toda vez.
 *
 * @param {object} props
 * @param {Array} props.campos - retorno de useCamposDinamicos().campos
 * @param {Record<string, any>} props.metadata
 * @param {(novoMetadata: Record<string, any>) => void} props.onChangeMetadata
 * @param {Record<string, string>} [props.erros] - mapa field_name -> mensagem,
 *   normalmente vindo de construirSchemaMetadata (lib/camposDinamicosValidation.js)
 * @param {string} [props.className]
 */
export function CamposDinamicosGrid({ campos, metadata, onChangeMetadata, erros = {}, className = '' }) {
  if (!campos?.length) return null;

  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      {campos.map((campo) => (
        <CampoDinamicoInput
          key={campo.id}
          campo={campo}
          valor={metadata?.[campo.field_name]}
          onChange={(novoValor) =>
            onChangeMetadata({ ...metadata, [campo.field_name]: novoValor })
          }
          error={erros[campo.field_name]}
        />
      ))}
    </div>
  );
}