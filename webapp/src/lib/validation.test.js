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
      // .trim() roda antes do required() na cadeia do yup, então uma string
      // só de espaços já chega vazia no required(), que é quem rejeita.
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

  // PED-170 (LGPD art. 14): campos só se tornam obrigatórios quando
  // data_nascimento indica menor de 18 anos — cobre a fronteira exata do
  // aniversário, já que é ela quem decide se o gate liga ou desliga.
  describe('responsável legal (aluno menor de 18 anos)', () => {
    const dataHaAnosAtras = (anos, ajusteDias = 0) => {
      const hoje = new Date();
      const data = new Date(hoje.getFullYear() - anos, hoje.getMonth(), hoje.getDate() + ajusteDias);
      return data.toISOString().split('T')[0];
    };
    const NASCIMENTO_MENOR = dataHaAnosAtras(15);
    const NASCIMENTO_MAIOR = dataHaAnosAtras(30);
    const responsavelValido = {
      responsavel_legal_nome: 'Maria da Silva',
      responsavel_legal_cpf: '529.982.247-25',
      responsavel_legal_parentesco: 'mae',
      consentimento_responsavel: true,
    };

    it('não exige nada quando data_nascimento indica maioridade', async () => {
      await expect(
        alunoSchema.validate({ ...base, data_nascimento: NASCIMENTO_MAIOR })
      ).resolves.toBeTruthy();
    });

    it('não exige nada quando data_nascimento está ausente', async () => {
      await expect(alunoSchema.validate({ ...base })).resolves.toBeTruthy();
    });

    it('rejeita menor sem nenhum dado do responsável', async () => {
      // Com todos os 4 campos ausentes, yup (abortEarly) pode reportar
      // qualquer um deles primeiro — o que importa aqui é que rejeita, não
      // qual mensagem específica sai na frente (isso já é coberto pelos
      // testes abaixo, que isolam um campo inválido por vez).
      await expect(
        alunoSchema.validate({ ...base, data_nascimento: NASCIMENTO_MENOR })
      ).rejects.toThrow();
    });

    it('rejeita menor sem CPF do responsável', async () => {
      await expect(
        alunoSchema.validate({
          ...base, data_nascimento: NASCIMENTO_MENOR, ...responsavelValido, responsavel_legal_cpf: '',
        })
      ).rejects.toThrow('CPF do responsável legal é obrigatório');
    });

    it('rejeita menor com CPF do responsável inválido', async () => {
      await expect(
        alunoSchema.validate({
          ...base, data_nascimento: NASCIMENTO_MENOR, ...responsavelValido, responsavel_legal_cpf: '111.111.111-11',
        })
      ).rejects.toThrow('CPF do responsável inválido');
    });

    it('rejeita menor sem parentesco selecionado', async () => {
      await expect(
        alunoSchema.validate({
          ...base, data_nascimento: NASCIMENTO_MENOR, ...responsavelValido, responsavel_legal_parentesco: '',
        })
      ).rejects.toThrow('Selecione o parentesco do responsável legal');
    });

    it('rejeita menor sem confirmar o consentimento', async () => {
      await expect(
        alunoSchema.validate({
          ...base, data_nascimento: NASCIMENTO_MENOR, ...responsavelValido, consentimento_responsavel: false,
        })
      ).rejects.toThrow('É necessário confirmar o consentimento do responsável legal');
    });

    it('aceita menor com todos os dados do responsável preenchidos e consentimento confirmado', async () => {
      await expect(
        alunoSchema.validate({ ...base, data_nascimento: NASCIMENTO_MENOR, ...responsavelValido })
      ).resolves.toBeTruthy();
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
