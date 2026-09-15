// mobile-pro/src/screens/Agenda/AgendaScreen.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Users } from 'lucide-react-native';
import { useSessaoAtual } from '@/features/auth';
import { useAulasDoDia, type AulaAgenda } from '@/features/agenda';
import { useThemeStore } from '@/lib/theme';
import { Body, Card, CardSkeleton, Display, EmptyState, ErrorState } from '@/components/ui';
import { fonts } from '@/lib/typography';
import type { AgendaStackParamList } from '@/navigation';

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_BANCO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function paraDataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

type Navegacao = NativeStackNavigationProp<AgendaStackParamList, 'ListaAulas'>;

function AulaCard({ aula, dataIso, onAbrirChamada }: { aula: AulaAgenda; dataIso: string; onAbrirChamada: () => void }) {
  const { tokens } = useThemeStore();
  return (
    <Pressable onPress={onAbrirChamada}>
      <Card className="mb-3">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-3">
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: tokens.pri }}>{aula.horario?.substring(0, 5)}</Text>
            <Text style={{ fontFamily: fonts.displaySemibold, fontSize: 16, color: '#0A0A1A', marginTop: 2 }}>{aula.atividade}</Text>
            <Body style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
              Prof. {aula.professores?.nome?.split(' ')[0] ?? 'A definir'}
            </Body>
            <View className="flex-row items-center gap-1 mt-2">
              <Users color="#9ca3af" size={13} />
              <Text className="text-gray-400 text-xs">{aula.vagas_ocupadas ?? 0}/{aula.capacidade} vagas</Text>
            </View>
          </View>
          <Text style={{ color: tokens.pri, fontFamily: fonts.bodyBold, fontSize: 13 }}>Fazer chamada ›</Text>
        </View>
      </Card>
    </Pressable>
  );
}

export default function AgendaScreen() {
  const navigation = useNavigation<Navegacao>();
  const { estudioId, professorId } = useSessaoAtual();
  const proximosDias = useMemo(() => gerarProximosDias(), []);
  const [diaAtivo, setDiaAtivo] = useState(proximosDias[0]);
  const { tokens } = useThemeStore();

  const { data: aulas, isLoading, isError, refetch } = useAulasDoDia(estudioId, professorId, diaAtivo.dataIso, diaAtivo.diaBanco);

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Agenda</Display>
        <Body style={{ color: '#9ca3af', marginTop: 2 }}>Toque numa aula pra fazer a chamada</Body>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 mb-2" contentContainerStyle={{ gap: 8 }}>
        {proximosDias.map((dia) => {
          const ativo = dia.dataIso === diaAtivo.dataIso;
          return (
            <Pressable
              key={dia.dataIso}
              onPress={() => setDiaAtivo(dia)}
              className="px-4 py-2 rounded-2xl items-center"
              style={{ backgroundColor: ativo ? tokens.pri : '#fff', borderWidth: 1, borderColor: ativo ? tokens.pri : '#e5e7eb' }}
            >
              <Text style={{ color: ativo ? tokens.priText : '#374151' }} className="text-sm font-bold">{dia.diaSemana}</Text>
              <Text style={{ color: ativo ? tokens.priText : '#9ca3af' }} className="text-xs">{dia.diaMes}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View className="px-5 pt-2" style={{ gap: 12 }}>
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </View>
      ) : isError ? (
        <View className="px-5"><ErrorState mensagem="Não foi possível carregar as aulas." onRetry={() => refetch()} /></View>
      ) : !aulas || aulas.length === 0 ? (
        <View className="px-5"><EmptyState titulo="Sem aulas neste dia" descricao="Toca em outro dia ali em cima." /></View>
      ) : (
        <FlatList
          data={aulas}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => (
            <AulaCard
              aula={item}
              dataIso={diaAtivo.dataIso}
              onAbrirChamada={() => navigation.navigate('Chamada', {
                aulaId: item.id,
                dataAula: diaAtivo.dataIso,
                atividade: item.atividade,
                horario: item.horario,
              })}
            />
          )}
        />
      )}
    </View>
  );
}
