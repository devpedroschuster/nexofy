import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/features/auth';
import type { Aluno, Estudio } from '@/types';

// Espelha a query de webapp/src/pages/AreaAluno.jsx (useQuery `meu-perfil`):
// busca o aluno pelo auth_id da sessão + join com o plano.
export function useMeuPerfil() {
  const { session } = useSession();

  return useQuery<Aluno>({
    queryKey: ['meu-perfil', session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alunos')
        .select('*, planos (id, nome, preco, duracao_meses, regras_acesso, is_plano_livre)')
        .eq('auth_id', session!.user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Cadastro de aluno não encontrado para este usuário.');
      return data as Aluno;
    },
  });
}

// O estudio_id de origem-da-verdade é o do próprio aluno (multi-tenant) —
// mesmo cuidado documentado em AreaAluno.jsx (linha 76-78 do arquivo original).
export function useEstudioDoAluno(estudioId: string | undefined) {
  return useQuery<Estudio>({
    queryKey: ['estudio', estudioId],
    enabled: !!estudioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estudios')
        .select('*')
        .eq('id', estudioId!)
        .single();
      if (error) throw error;
      return data as Estudio;
    },
  });
}

export interface DadosEditaveisAluno {
  telefone: string;
  cpf: string;
  data_nascimento: string;
}

// Espelha handleSalvarPerfil de webapp/src/pages/AreaAluno.jsx — só os
// campos editáveis pelo próprio aluno (nome/e-mail exigem outro fluxo).
export function useAtualizarPerfil(alunoId: number | undefined, authId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dados: DadosEditaveisAluno) => {
      const { error } = await supabase
        .from('alunos')
        .update(dados)
        .eq('id', alunoId!)
        .eq('auth_id', authId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meu-perfil'] }),
  });
}

// Espelha handleAvatarUpload de webapp/src/pages/AreaAluno.jsx — mesmo bucket
// 'avatars', mesmo limite de 5MB / jpeg,png,webp (validado na tela, não aqui).
export function useUploadAvatar(alunoId: number | undefined, authId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ uri, fileExt }: { uri: string; fileExt: string }) => {
      const fileName = `${alunoId}-${Date.now()}.${fileExt}`;
      const arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, arrayBuffer, {
        contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const { error: updateError } = await supabase
        .from('alunos')
        .update({ avatar_url: publicUrl })
        .eq('id', alunoId!)
        .eq('auth_id', authId!);
      if (updateError) throw updateError;
      return publicUrl;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meu-perfil'] }),
  });
}

// LGPD — reaproveita a mesma Edge Function do webapp (exportar-dados-aluno),
// que resolve o titular por auth.uid(), sem precisar enviar aluno_id.
export function useExportarDados() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('exportar-dados-aluno', { method: 'POST', body: {} });
      if (error) throw error;
      return data.dados;
    },
  });
}

// Espelha handleSolicitarExclusao — registra o pedido, quem executa a
// exclusão de fato é o admin do estúdio dentro do prazo da Política de Privacidade.
export function useSolicitarExclusao(alunoId: number | undefined, estudioId: string | undefined) {
  const { session } = useSession();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('solicitacoes_titular').insert({
        aluno_id: alunoId,
        estudio_id: estudioId,
        tipo: 'exclusao',
        solicitado_por: session?.user?.id,
      });
      if (error) throw error;
    },
  });
}
