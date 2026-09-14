import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { CheckCircle2, Users } from 'lucide-react-native';
import { useMeuPerfil } from '@/features/aluno';
import { useAgendarAula, useAulasDoDia, useCancelarAgendamento } from '@/features/agenda';
import { useThemeStore } from '@/lib/theme';
import { Body, Button, Card, CardSkeleton, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { fonts } from '@/lib/typography';
import type { Aula } from '@/types';

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_BANCO = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado',
];

// Mesma correção que existe em AreaAluno.jsx: monta a data local sem
// toISOString() pra não deslocar o dia em fusos negativos (Brasil).
function paraDataLocalStr(d: Date) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function gerarProximosDias() {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dias.push({
      dataIso: paraDataLocalStr(d),
      diaSemana: i === 0 ? 'Hoje' : NOMES_DIAS[d.getDay()],
      diaMes: paraDataLocalStr(d).split('-').slice(1).reverse().join('/'),
      diaBanco: DIAS_BANCO[d.getDay()],
    });
  }
  return dias;
}

interface AulaCardProps {
  aula: Aula;
  alunoId: number;
  estudioId: string;
  dataIso: string;
}
function AulaCard({ aula, alunoId, estudioId, dataIso }: AulaCardProps) {
  const { tokens } = useThemeStore();
  const agendarMutation = useAgendarAula(alunoId, estudioId);
  const cancelarMutation = useCancelarAgendamento(alunoId, estudioId);

  const jaAgendado = aula.presencas?.some((p) => p.aluno_id === alunoId) ?? false;
  const vagasRestantes = aula.capacidade - (aula.vagas_ocupadas ?? 0);
  const lotado = vagasRestantes <= 0;
  const erro = agendarMutation.error ?? cancelarMutation.error;

  return (
    <Card className="mb-3">
      <View className="flex-row justify-between items-start">
        <View className="flex-1 pr-3">
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: tokens.pri }}>{aula.horario?.substring(0, 5)}</Text>
          <Text style={{ fontFamily: fonts.displaySemibold, fontSize: 16, color: '#0A0A1A', marginTop: 2 }}>{aula.atividade}</Text>
          <Body style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
            Prof. {aula.professores?.nome?.split(' ')[0] ?? 'A definir'}
          </Body>
          <View className="flex-row items-center gap-1 mt-2">
            <Users color="#9ca3af" size={13} />
            <Text className="text-gray-400 text-xs">
              {aula.vagas_ocupadas ?? 0}/{aula.capacidade} vagas ocupadas
            </Text>
          </View>
        </View>

        {jaAgendado ? (
          <View className="items-end">
            <Button
              variant="danger"
              loading={cancelarMutation.isPending}
              onPress={() => cancelarMutation.mutate({ aulaId: aula.id, dataAula: dataIso })}
            >
              Cancelar
            </Button>
            <View className="flex-row items-center gap-1 mt-2">
              <CheckCircle2 color="#16a34a" size={13} />
              <Text className="text-emerald-600 text-xs font-bold">Agendado</Text>
            </View>
          </View>
        ) : (
          <Button
            variant={lotado ? 'outline' : 'primary'}
            disabled={lotado}
            loading={agendarMutation.isPending}
            onPress={() => agendarMutation.mutate({ aulaId: aula.id, dataAula: dataIso })}
          >
            {lotado ? 'Esgotado' : 'Agendar'}
          </Button>
        )}
      </View>

      {erro && (
        <Text className="text-rose-600 text-xs mt-3">
          {erro instanceof Error ? erro.message : 'Ação recusada pelo estúdio.'}
        </Text>
      )}
    </Card>
  );
}

export default function AgendaScreen() {
  const { tokens } = useThemeStore();
  const proximosDias = useMemo(() => gerarProximosDias(), []);
  const [diaAtivo, setDiaAtivo] = useState(proximosDias[0]);

  const { data: aluno, isLoading: carregandoAluno } = useMeuPerfil();

  const {
    data: aulas,
    isLoading: carregandoAulas,
    isError: erroAulas,
    refetch: refetchAulas,
  } = useAulasDoDia(aluno?.estudio_id, diaAtivo.dataIso, diaAtivo.diaBanco);

  if (carregandoAluno) return <LoadingState label="Carregando..." />;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Agendar aulas</Display>
        <Body style={{ color: '#9ca3af', marginTop: 2 }}>Escolha o dia e reserve sua vaga</Body>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="px-5 mb-2"
        contentContainerStyle={{ gap: 8 }}
      >
        {proximosDias.map((dia) => {
          const ativo = dia.dataIso === diaAtivo.dataIso;
          return (
            <Pressable
              key={dia.dataIso}
              onPress={() => setDiaAtivo(dia)}
              className="px-4 py-2 rounded-2xl items-center"
              style={{ backgroundColor: ativo ? tokens.pri : '#fff', borderWidth: 1, borderColor: ativo ? tokens.pri : '#e5e7eb' }}
            >
              <Text style={{ color: ativo ? tokens.priText : '#374151' }} className="text-sm font-bold">
                {dia.diaSemana}
              </Text>
              <Text style={{ color: ativo ? tokens.priText : '#9ca3af' }} className="text-xs">
                {dia.diaMes}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!aluno?.planos ? (
        <View className="px-5">
          <EmptyState
            titulo="Você ainda não tem um plano"
            descricao="Fale com o estúdio pra ativar seu plano — assim que estiver pronto, as aulas aparecem aqui."
          />
        </View>
      ) : carregandoAulas ? (
        <View className="px-5 pt-2" style={{ gap: 12 }}>
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : erroAulas ? (
        <View className="px-5">
          <ErrorState mensagem="Não foi possível carregar as aulas." onRetry={() => refetchAulas()} />
        </View>
      ) : !aulas || aulas.length === 0 ? (
        <View className="px-5">
          <EmptyState titulo="Sem aulas neste dia" descricao="Toca em outro dia ali em cima pra ver os horários disponíveis." />
        </View>
      ) : (
        <FlatList
          data={aulas}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => (
            <AulaCard aula={item} alunoId={aluno.id} estudioId={aluno.estudio_id} dataIso={diaAtivo.dataIso} />
          )}
        />
      )}
    </View>
  );
}
