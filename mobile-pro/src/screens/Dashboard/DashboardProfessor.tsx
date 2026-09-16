// mobile-pro/src/screens/Dashboard/DashboardProfessor.tsx
import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { CalendarClock, TrendingUp } from 'lucide-react-native';
import { useAulasDoDia } from '@/features/agenda';
import { useRepassesProfessor } from '@/features/financeiro';
import { useThemeStore } from '@/lib/theme';
import { Body, Card, CardSkeleton, Display, EmptyState } from '@/components/ui';
import { fonts } from '@/lib/typography';

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_BANCO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function paraDataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function mesAnoAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardProfessor({
  estudioId,
  professorId,
  nomeUsuario,
}: {
  estudioId: string;
  professorId: number | null;
  nomeUsuario: string | null;
}) {
  const { tokens } = useThemeStore();
  const hoje = useMemo(() => new Date(), []);
  const dataIso = paraDataLocalStr(hoje);
  const diaBanco = DIAS_BANCO[hoje.getDay()];

  const { data: aulasHoje, isLoading: carregandoAulas, refetch: refetchAulas } = useAulasDoDia(
    estudioId,
    professorId,
    dataIso,
    diaBanco
  );
  const { data: repasses, isLoading: carregandoRepasses, refetch: refetchRepasses } = useRepassesProfessor(
    professorId,
    estudioId,
    mesAnoAtual()
  );

  const resumoComissoes = useMemo(() => {
    if (!repasses) return { total: 0, pendente: 0 };
    return repasses.reduce(
      (acc, r) => {
        acc.total += r.valor ?? 0;
        if (r.status !== 'pago') acc.pendente += r.valor ?? 0;
        return acc;
      },
      { total: 0, pendente: 0 }
    );
  }, [repasses]);

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#FDF8F5' }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refetchAulas(); refetchRepasses(); }} />}
    >
      <Display style={{ fontSize: 24 }}>Olá, {nomeUsuario?.split(' ')[0] ?? 'instrutor(a)'} 👋</Display>

      <Card>
        <View className="flex-row items-center gap-2 mb-3">
          <CalendarClock color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>
            Suas aulas hoje
          </Text>
        </View>
        {carregandoAulas ? (
          <CardSkeleton />
        ) : !aulasHoje || aulasHoje.length === 0 ? (
          <EmptyState titulo="Nada marcado hoje" descricao="Sem aulas suas na grade de hoje." />
        ) : (
          aulasHoje.map((aula) => (
            <View key={aula.id} className="flex-row items-center justify-between py-2 border-b border-gray-100">
              <Text className="text-sm font-bold text-gray-800">{aula.atividade}</Text>
              <Text style={{ color: tokens.pri, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                {aula.horario?.substring(0, 5)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <View className="flex-row items-center gap-2 mb-3">
          <TrendingUp color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>
            Comissões do mês
          </Text>
        </View>
        {carregandoRepasses ? (
          <CardSkeleton />
        ) : (
          <View className="flex-row justify-between">
            <View>
              <Body style={{ color: '#9ca3af', fontSize: 12 }}>Total</Body>
              <Display style={{ fontSize: 18 }}>{formatarMoeda(resumoComissoes.total)}</Display>
            </View>
            <View>
              <Body style={{ color: '#9ca3af', fontSize: 12 }}>Pendente</Body>
              <Display style={{ fontSize: 18 }}>{formatarMoeda(resumoComissoes.pendente)}</Display>
            </View>
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
