// mobile-pro/src/screens/Agenda/ChamadaScreen.tsx
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useSessaoAtual } from '@/features/auth';
import {
  deriveEstadoChamada,
  useDesfazerRegistro,
  useListaChamada,
  useMarcarPresenca,
  useRegistrarFalta,
  type AlunoChamada,
} from '@/features/agenda';
import { useThemeStore } from '@/lib/theme';
import { Badge, Body, Button, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import type { AgendaStackParamList } from '@/navigation';

type Rota = RouteProp<AgendaStackParamList, 'Chamada'>;

function LinhaAluno({ aluno }: { aluno: AlunoChamada }) {
  const { estudioId } = useSessaoAtual();
  const route = useRoute<Rota>();
  const { aulaId, dataAula } = route.params;

  const marcarPresenca = useMarcarPresenca(aulaId, dataAula, estudioId);
  const registrarFalta = useRegistrarFalta(aulaId, dataAula, estudioId);
  const desfazer = useDesfazerRegistro(estudioId);

  const estado = deriveEstadoChamada(aluno);
  const processando = marcarPresenca.isPending || registrarFalta.isPending || desfazer.isPending;

  return (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
      <View className="flex-1 pr-3">
        <Text className="text-sm font-bold text-gray-800">{aluno.nome}</Text>
        <Badge tone={estado === 'presente' ? 'ok' : estado === 'falta' ? 'err' : 'warn'}>
          {estado === 'presente' ? 'Presente' : estado === 'falta' ? 'Faltou' : 'Pendente'}
        </Badge>
      </View>
      {estado === 'pendente' ? (
        <View className="flex-row gap-2">
          <Button variant="primary" loading={marcarPresenca.isPending} disabled={processando} onPress={() => marcarPresenca.mutate(aluno)}>
            Presente
          </Button>
          <Button variant="danger" loading={registrarFalta.isPending} disabled={processando} onPress={() => registrarFalta.mutate({ aluno, tipoFalta: 'nao_avisada' })}>
            Falta
          </Button>
        </View>
      ) : (
        <Button variant="outline" loading={desfazer.isPending} disabled={processando} onPress={() => desfazer.mutate(aluno)}>
          Desfazer
        </Button>
      )}
    </View>
  );
}

export default function ChamadaScreen() {
  const route = useRoute<Rota>();
  const { estudioId } = useSessaoAtual();
  const { tokens } = useThemeStore();
  const { aulaId, dataAula, atividade, horario } = route.params;

  const { data: lista, isLoading, isError, refetch } = useListaChamada(aulaId, dataAula, estudioId);

  if (isLoading) return <LoadingState label="Carregando chamada..." />;
  if (isError || !lista) {
    return (
      <View className="flex-1 justify-center px-6 bg-white">
        <ErrorState mensagem="Não foi possível carregar a lista de presença." onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20 }}>
      <Display style={{ fontSize: 20 }}>{atividade}</Display>
      <Body style={{ color: '#9ca3af', marginBottom: 16 }}>{horario?.substring(0, 5)} · {dataAula}</Body>

      {lista.length === 0 ? (
        <EmptyState titulo="Sem alunos nessa aula" descricao="Não há fixos, avulsos ou leads agendados pra essa data." />
      ) : (
        lista.map((aluno) => <LinhaAluno key={aluno.id_relacao} aluno={aluno} />)
      )}
    </ScrollView>
  );
}
