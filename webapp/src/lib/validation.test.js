import { describe, it, expect } from 'vitest';
import { alunoSchema } from './validation';

const base = {
  nome_completo: 'Maria da Silva',
  email: 'maria@exemplo.com',
};

describe('alunoSchema', () => {
  describe('nome_completo', () => {
    it('rejeita ausência', async () => {
      await expect(alunoSchema.validate({ ...base, nome_completo: undefined })).rejects.toThrow(
        'O nome completo é obrigatório.'
      );
    });

    it('rejeita string só com espaços (vira required após o trim)', async () => {
      // .trim() roda antes do required()/test() na cadeia do yup, então uma
      // string só de espaços já chega vazia nos validators seguintes — quem
      // pega esse caso é o required(), não o teste customizado 'nao-so-espacos'.
      await expect(alunoSchema.validate({ ...base, nome_completo: '   ' })).rejects.toThrow(
        'O nome completo é obrigatório.'
      );
    });

    it('rejeita acima de 150 caracteres', async () => {
      await expect(
        alunoSchema.validate({ ...base, nome_completo: 'a'.repeat(151) })
      ).rejects.toThrow('no máximo 150 caracteres');
    });

    it('aceita nome válido e aplica trim', async () => {
      const resultado = await alunoSchema.validate({ ...base, nome_completo: '  Maria  ' });
      expect(resultado.nome_completo).toBe('Maria');
    });
  });

  describe('email', () => {
    it('rejeita ausência', async () => {
      await expect(alunoSchema.validate({ ...base, email: undefined })).rejects.toThrow(
        'O e-mail é obrigatório.'
      );
    });

    it('rejeita formato inválido', async () => {
      await expect(alunoSchema.validate({ ...base, email: 'não-é-email' })).rejects.toThrow(
        'Insira um e-mail válido.'
      );
    });

    it('rejeita acima de 255 caracteres', async () => {
      const emailGigante = `${'a'.repeat(250)}@ex.com`;
      await expect(alunoSchema.validate({ ...base, email: emailGigante })).rejects.toThrow(
        'no máximo 255 caracteres'
      );
    });

    it('normaliza para minúsculo e aplica trim', async () => {
      const resultado = await alunoSchema.validate({ ...base, email: '  Maria@Exemplo.COM  ' });
      expect(resultado.email).toBe('maria@exemplo.com');
    });
  });

  describe('cpf', () => {
    it('aceita ausência (campo opcional)', async () => {
      await expect(alunoSchema.validate({ ...base, cpf: null })).resolves.toBeTruthy();
    });

    it('aceita CPF válido', async () => {
      await expect(
        alunoSchema.validate({ ...base, cpf: '529.982.247-25' })
      ).resolves.toBeTruthy();
    });

    it('rejeita CPF com dígito verificador inválido', async () => {
      await expect(alunoSchema.validate({ ...base, cpf: '123.456.789-00' })).rejects.toThrow(
        'CPF inválido'
      );
    });

    it('rejeita CPF com todos os dígitos iguais', async () => {
      await expect(alunoSchema.validate({ ...base, cpf: '111.111.111-11' })).rejects.toThrow(
        'CPF inválido'
      );
    });
  });

  describe('role', () => {
    it('usa "aluno" como default quando ausente', async () => {
      const resultado = await alunoSchema.validate({ ...base });
      expect(resultado.role).toBe('aluno');
    });

    it('aceita "admin"', async () => {
      const resultado = await alunoSchema.validate({ ...base, role: 'admin' });
      expect(resultado.role).toBe('admin');
    });

    it('rejeita valor fora de aluno/admin', async () => {
      await expect(alunoSchema.validate({ ...base, role: 'super' })).rejects.toThrow(
        'Papel inválido.'
      );
    });
  });

  describe('data_nascimento', () => {
    it('aceita ausência', async () => {
      await expect(alunoSchema.validate({ ...base, data_nascimento: null })).resolves.toBeTruthy();
    });

    it('rejeita data inválida', async () => {
      await expect(
        alunoSchema.validate({ ...base, data_nascimento: 'não-é-data' })
      ).rejects.toThrow('Data de nascimento inválida.');
    });

    it('rejeita data no futuro', async () => {
      const futuro = new Date();
      futuro.setFullYear(futuro.getFullYear() + 1);
      await expect(
        alunoSchema.validate({ ...base, data_nascimento: futuro.toISOString() })
      ).rejects.toThrow('Data de nascimento inválida.');
    });

    it('rejeita idade acima de 120 anos', async () => {
      const hoje = new Date();
      const antigo = new Date(hoje.getFullYear() - 121, hoje.getMonth(), hoje.getDate());
      await expect(
        alunoSchema.validate({ ...base, data_nascimento: antigo.toISOString() })
      ).rejects.toThrow('Data de nascimento inválida.');
    });

    it('aceita data de nascimento plausível', async () => {
      await expect(
        alunoSchema.validate({ ...base, data_nascimento: '1990-05-20' })
      ).resolves.toBeTruthy();
    });
  });

  describe('telefone', () => {
    it('aceita ausência', async () => {
      await expect(alunoSchema.validate({ ...base, telefone: null })).resolves.toBeTruthy();
    });

    it('aceita 10 dígitos', async () => {
      await expect(
        alunoSchema.validate({ ...base, telefone: '1133334444' })
      ).resolves.toBeTruthy();
    });

    it('aceita 11 dígitos', async () => {
      await expect(
        alunoSchema.validate({ ...base, telefone: '11933334444' })
      ).resolves.toBeTruthy();
    });

    it('rejeita quantidade de dígitos inválida', async () => {
      await expect(alunoSchema.validate({ ...base, telefone: '123' })).rejects.toThrow(
        'Telefone inválido.'
      );
    });
  });

  describe('cep', () => {
    it('aceita ausência', async () => {
      await expect(alunoSchema.validate({ ...base, cep: null })).resolves.toBeTruthy();
    });

    it('aceita 8 dígitos', async () => {
      await expect(alunoSchema.validate({ ...base, cep: '01310-100' })).resolves.toBeTruthy();
    });

    it('rejeita quantidade de dígitos inválida', async () => {
      await expect(alunoSchema.validate({ ...base, cep: '123' })).rejects.toThrow(
        'CEP inválido.'
      );
    });
  });
});
