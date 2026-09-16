// mobile-pro/src/features/agenda.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/features/auth';
import { deriveEstadoChamada, montarPayloadPresenca, type AlunoChamada } from '@/features/chamada';

export interface AulaAgenda {
  id: number;
  atividade: string;
  dia_semana: string | null;
  data_especifica: string | null;
  horario: string;
  capacidade: number;
  vagas_ocupadas: number;
  professor_id: number | null;
  professores?: { nome: string } | null;
  modalidades?: { area: string } | null;
}

// Port da query de webapp/src/pages/Agenda + webapp/src/pages/Presenca.jsx —
// grade do dia (dia_semana OU data_especifica), filtrada por professor
// quando o papel é instrutor (professorId != null); gestor vê tudo (null).
export function useAulasDoDia(
  estudioId: string | null,
  professorId: number | null,
  dataIso: string,
  diaSemanaBanco: string
) {
  return useQuery<AulaAgenda[]>({
    queryKey: ['agenda', estudioId, professorId, dataIso],
    enabled: !!estudioId,
    queryFn: async () => {
      const diaCurto = diaSemanaBanco.split('-')[0];
      let query = supabase
        .from('agenda')
        .select('id, atividade, dia_semana, data_especifica, horario, capacidade, vagas_ocupadas, professor_id, professores(nome), modalidades(area)')
        .eq('estudio_id', estudioId!)
        .eq('ativa', true)
        .or(`dia_semana.ilike.*${diaCurto}*,data_especifica.eq.${dataIso}`)
        .order('horario', { ascending: true });
      if (professorId) query = query.eq('professor_id', professorId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AulaAgenda[];
    },
  });
}

// ── Chamada de uma aula específica — port de webapp/src/services/presencaService.js
// (listarChamadaCompleta/registrarCheckin/registrarFalta/desfazerCheckin) +
// webapp/src/pages/Agenda/hooks/useListaPresenca.js. ──────────────────────

export function useListaChamada(aulaId: number | undefined, dataAula: string | undefined, estudioId: string | null) {
  return useQuery<AlunoChamada[]>({
    queryKey: ['chamada', estudioId, aulaId, dataAula],
    enabled: !!aulaId && !!dataAula && !!estudioId,
    queryFn: async () => {
      const [{ data: fixos, error: errFixos }, { data: registros, error: errRegistros }] = await Promise.all([
        supabase
          .from('agenda_fixa')
          .select('id, aluno_id, alunos(id, nome_completo)')
          .eq('aula_id', aulaId!)
          .eq('estudio_id', estudioId!),
        supabase
          .from('presencas')
          .select('id, aluno_id, lead_id, origem, status, alunos(id, nome_completo), leads(id, nome_visitante)')
          .eq('estudio_id', estudioId!)
          .eq('aula_id', aulaId!)
          .eq('data_aula', dataAula!),
      ]);

      if (errFixos) throw errFixos;
      if (errRegistros) throw errRegistros;

      const registrosPorAluno = new Map(
        (registros ?? [])
          .filter((r: any) => r.origem === 'fixo' && r.aluno_id)
          .map((r: any) => [r.aluno_id, r])
      );

      const lista: AlunoChamada[] = [];

      (fixos ?? []).forEach((f: any) => {
        const registroDoDia = registrosPorAluno.get(f.aluno_id);
        lista.push({
          id_relacao: registroDoDia?.id ?? f.id,
          aluno_id: f.aluno_id,
          lead_id: null,
          nome: f.alunos?.nome_completo ?? 'Aluno',
          tipo: 'fixo',
          status: registroDoDia?.status ?? 'presente',
          registroExiste: !!registroDoDia,
        });
      });

      (registros ?? [])
        .filter((r: any) => r.origem !== 'fixo')
        .forEach((r: any) => {
          lista.push({
            id_relacao: r.id,
            aluno_id: r.aluno_id,
            lead_id: r.lead_id,
            nome: r.alunos?.nome_completo ?? r.leads?.nome_visitante ?? 'Visitante',
            tipo: r.origem === 'lead' ? 'experimental' : 'avulso',
            status: r.status,
            registroExiste: true,
          });
        });

      return lista;
    },
  });
}

export function useMarcarPresenca(aulaId: number | undefined, dataAula: string | undefined, estudioId: string | null) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async (aluno: AlunoChamada) => {
      const payload = montarPayloadPresenca(aluno, aulaId!, dataAula!);
      const agora = new Date().toISOString();
      const registradoPor = session?.user?.id ?? null;

      if (payload.presencaId) {
        const { error } = await supabase
          .from('presencas')
          .update({ status: 'presente', data_checkin: agora, registrado_por: registradoPor })
          .eq('id', payload.presencaId)
          .eq('estudio_id', estudioId!);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('presencas').upsert(
        [{
          estudio_id: estudioId,
          aluno_id: payload.alunoId,
          aula_id: payload.aulaId,
          data_aula: payload.dataAula,
          origem: payload.origem,
          status: 'presente',
          data_checkin: agora,
          registrado_por: registradoPor,
        }],
        { onConflict: 'aluno_id,aula_id,data_aula', ignoreDuplicates: false }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chamada'] }),
  });
}

export function useRegistrarFalta(aulaId: number | undefined, dataAula: string | undefined, estudioId: string | null) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async ({ aluno, tipoFalta }: { aluno: AlunoChamada; tipoFalta: 'justificada' | 'nao_avisada' }) => {
      const payload = montarPayloadPresenca(aluno, aulaId!, dataAula!);
      const status = tipoFalta === 'justificada' ? 'falta_justificada' : 'falta_nao_avisada';
      const registradoPor = session?.user?.id ?? null;

      if (payload.presencaId) {
        const { error } = await supabase
          .from('presencas')
          .update({ status, data_checkin: null, registrado_por: registradoPor })
          .eq('id', payload.presencaId)
          .eq('estudio_id', estudioId!);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('presencas').upsert(
        [{
          estudio_id: estudioId,
          aluno_id: payload.alunoId,
          aula_id: payload.aulaId,
          data_aula: payload.dataAula,
          origem: payload.origem,
          status,
          registrado_por: registradoPor,
        }],
        { onConflict: 'aluno_id,aula_id,data_aula', ignoreDuplicates: false }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chamada'] }),
  });
}

// Desfaz check-in ou falta: fixo volta ao estado implícito (apaga a linha);
// avulso/lead não pode sumir (perderia o rastro do agendamento), volta pra
// 'agendado'. Port de presencaService.desfazerCheckin/removerFalta.
export function useDesfazerRegistro(estudioId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (aluno: AlunoChamada) => {
      if (!aluno.registroExiste) return;

      const { data: registro, error: errBusca } = await supabase
        .from('presencas')
        .select('id, origem')
        .eq('id', aluno.id_relacao)
        .eq('estudio_id', estudioId!)
        .single();
      if (errBusca) throw errBusca;

      if (registro.origem === 'fixo') {
        const { error } = await supabase
          .from('presencas')
          .delete()
          .eq('id', aluno.id_relacao)
          .eq('estudio_id', estudioId!);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('presencas')
        .update({ status: 'agendado', data_checkin: null, registrado_por: null })
        .eq('id', aluno.id_relacao)
        .eq('estudio_id', estudioId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chamada'] }),
  });
}

// Cancela (apaga) um agendamento avulso/lead — port de
// webapp/src/services/presencaService.js's cancelarAgendamento(id, estudioId).
// Diferente de useDesfazerRegistro (que reverte o status), esta função
// apaga a linha de `presencas` por completo. Só faz sentido pra uma linha
// que já tem registro (avulso/lead); um fixo sem registro não tem o que apagar.
export function useCancelarAgendamento(estudioId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (aluno: AlunoChamada) => {
      if (!aluno.registroExiste) return;
      const { error } = await supabase
        .from('presencas')
        .delete()
        .eq('id', aluno.id_relacao)
        .eq('estudio_id', estudioId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chamada'] }),
  });
}

export { deriveEstadoChamada };
export type { AlunoChamada };
