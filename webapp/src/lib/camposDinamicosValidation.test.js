import { describe, it, expect } from 'vitest';
import * as yup from 'yup';
import {
  construirSchemaMetadata,
  combinarComCamposDinamicos,
} from './camposDinamicosValidation';

describe('construirSchemaMetadata', () => {
  it('retorna schema vazio para lista de campos vazia', async () => {
    const schema = construirSchemaMetadata([]);
    await expect(schema.validate({})).resolves.toEqual({});
  });

  describe('field_type: number', () => {
    const campos = [{ field_name: 'idade', label: 'Idade', field_type: 'number' }];

    it('aceita número', async () => {
      const schema = construirSchemaMetadata(campos);
      await expect(schema.validate({ idade: 30 })).resolves.toEqual({ idade: 30 });
    });

    it('rejeita valor não numérico', async () => {
      const schema = construirSchemaMetadata(campos);
      await expect(schema.validate({ idade: 'trinta' })).rejects.toThrow(
        'Idade deve ser um número.'
      );
    });

    it('aceita ausência (nullable, não required)', async () => {
      const schema = construirSchemaMetadata(campos);
      await expect(schema.validate({ idade: null })).resolves.toBeTruthy();
    });
  });

  describe('field_type: boolean', () => {
    const campos = [{ field_name: 'ativo', label: 'Ativo', field_type: 'boolean' }];

    it('aceita true/false', async () => {
      const schema = construirSchemaMetadata(campos);
      await expect(schema.validate({ ativo: true })).resolves.toEqual({ ativo: true });
      await expect(schema.validate({ ativo: false })).resolves.toEqual({ ativo: false });
    });

    it('required rejeita ausência mesmo sendo boolean', async () => {
      const schema = construirSchemaMetadata([{ ...campos[0], is_required: true }]);
      await expect(schema.validate({})).rejects.toThrow('Ativo é obrigatório.');
    });
  });

  describe('field_type: select', () => {
    const campos = [
      { field_name: 'plano', label: 'Plano', field_type: 'select', opcoes: ['mensal', 'anual'] },
    ];

    it('aceita valor dentro das opções', async () => {
      const schema = construirSchemaMetadata(campos);
      await expect(schema.validate({ plano: 'mensal' })).resolves.toEqual({ plano: 'mensal' });
    });

    it('rejeita valor fora das opções', async () => {
      const schema = construirSchemaMetadata(campos);
      await expect(schema.validate({ plano: 'trimestral' })).rejects.toThrow(
        'Selecione uma opção válida para Plano.'
      );
    });

    it('aceita ausência (null/undefined/vazio liberados explicitamente)', async () => {
      const schema = construirSchemaMetadata(campos);
      await expect(schema.validate({ plano: null })).resolves.toBeTruthy();
      await expect(schema.validate({ plano: '' })).resolves.toBeTruthy();
    });
  });

  describe('field_type: text (e default)', () => {
    it('aplica trim em texto', async () => {
      const schema = construirSchemaMetadata([
        { field_name: 'obs', label: 'Observação', field_type: 'text' },
      ]);
      const resultado = await schema.validate({ obs: '  oi  ' });
      expect(resultado.obs).toBe('oi');
    });

    it('cai no ramo default (texto) para field_type desconhecido', async () => {
      const schema = construirSchemaMetadata([
        { field_name: 'obs', label: 'Observação', field_type: 'tipo-inexistente' },
      ]);
      const resultado = await schema.validate({ obs: '  oi  ' });
      expect(resultado.obs).toBe('oi');
    });
  });

  describe('is_required (campos não-boolean)', () => {
    it('rejeita string vazia', async () => {
      const schema = construirSchemaMetadata([
        { field_name: 'obs', label: 'Observação', field_type: 'text', is_required: true },
      ]);
      await expect(schema.validate({ obs: '' })).rejects.toThrow('Observação é obrigatório.');
    });
  });

  it('não rejeita chave extra fora do catálogo de campos ativos (noUnknown: false)', async () => {
    const schema = construirSchemaMetadata([
      { field_name: 'obs', label: 'Observação', field_type: 'text' },
    ]);
    await expect(
      schema.validate(
        { obs: 'ok', campo_desativado: 'valor antigo' },
        { stripUnknown: false }
      )
    ).resolves.toBeTruthy();
  });
});

describe('combinarComCamposDinamicos', () => {
  const schemaFixo = yup.object().shape({
    nome: yup.string().required(),
  });

  it('mescla o schema dinâmico dentro de metadata', async () => {
    const schema = combinarComCamposDinamicos(schemaFixo, [
      { field_name: 'idade', label: 'Idade', field_type: 'number', is_required: true },
    ]);

    await expect(
      schema.validate({ nome: 'Ana', metadata: { idade: 25 } })
    ).resolves.toEqual({ nome: 'Ana', metadata: { idade: 25 } });
  });

  it('erro de campo dinâmico obrigatório sai sob o path metadata.<campo>', async () => {
    const schema = combinarComCamposDinamicos(schemaFixo, [
      { field_name: 'idade', label: 'Idade', field_type: 'number', is_required: true },
    ]);

    try {
      await schema.validate({ nome: 'Ana', metadata: {} }, { abortEarly: false });
      throw new Error('deveria ter rejeitado');
    } catch (err) {
      expect(err.inner.some((e) => e.path === 'metadata.idade')).toBe(true);
    }
  });

  it('sem campos dinâmicos, metadata vira schema vazio', async () => {
    const schema = combinarComCamposDinamicos(schemaFixo, []);
    await expect(
      schema.validate({ nome: 'Ana', metadata: {} })
    ).resolves.toBeTruthy();
  });
});
