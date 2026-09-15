// mobile-pro/src/screens/Financeiro/RepassesProfessor.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRepassesProfessor } from '@/features/financeiro';
import { useThemeStore } from '@/lib/theme';
import { Badge, Card, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';

function mesAnoAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function navegarMes(mesAno: string, delta: number) {
  const [ano, mes] = mesAno.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAnoLabel(mesAno: string) {
  const [ano, mes] = mesAno.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RepassesProfessor({ estudioId, professorId }: { estudioId: string; professorId: number | null }) {
  const { tokens } = useThemeStore();
  const [mesAno, setMesAno] = useState(mesAnoAtual);
  const { data: repasses, isLoading, isError, refetch } = useRepassesProfessor(professorId, estudioId, mesAno);

  const kpis = useMemo(() => {
    if (!repasses) return { total: 0, qtdPaga: 0, qtdPendente: 0 };
    return repasses.reduce(
      (acc, r) => {
        if (r.status === 'pago') {
          acc.qtdPaga += 1;
        } else if (r.status !== 'cancelado') {
          acc.total += r.valor ?? 0;
          acc.qtdPendente += 1;
        }
        return acc;
      },
      { total: 0, qtdPaga: 0, qtdPendente: 0 }
    );
  }, [repasses]);

  const podeFuturo = mesAno < mesAnoAtual();

  if (isLoading) return <LoadingState label="Carregando repasses..." />;
  if (isError || !repasses) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState mensagem="Não foi possível carregar seus repasses." onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Meus repasses</Display>
        <View className="flex-row items-center gap-3 mt-2">
          <Pressable onPress={() => setMesAno((m) => navegarMes(m, -1))}><ChevronLeft color={tokens.pri} size={20} /></Pressable>
          <Text className="text-sm font-bold text-gray-700 capitalize">{mesAnoLabel(mesAno)}</Text>
          <Pressable disabled={!podeFuturo} onPress={() => setMesAno((m) => navegarMes(m, 1))}>
            <ChevronRight color={podeFuturo ? tokens.pri : '#d1d5db'} size={20} />
          </Pressable>
        </View>
      </View>

      <View className="px-5 pb-2">
        <Card>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-xs text-gray-400">Total a receber</Text>
              <Display style={{ fontSize: 18 }}>{formatarMoeda(kpis.total)}</Display>
            </View>
            <View>
              <Text className="text-xs text-gray-400">Pago / Pendente</Text>
              <Display style={{ fontSize: 18 }}>{kpis.qtdPaga} / {kpis.qtdPendente}</Display>
            </View>
          </View>
        </Card>
      </View>

      {repasses.length === 0 ? (
        <View className="px-5"><EmptyState titulo="Nenhum repasse" descricao={`Seus repasses de ${mesAnoLabel(mesAno)} aparecem aqui após o fechamento do mês.`} /></View>
      ) : (
        <FlatList
          data={repasses}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => (
            <Card className="mb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-bold text-gray-800">{item.alunos?.nome_completo ?? '—'}</Text>
                  <Text className="text-xs text-gray-400 mt-1">{item.modalidade ?? '—'}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-gray-800">{formatarMoeda(item.valor)}</Text>
                  <Badge tone={item.status === 'pago' ? 'ok' : 'warn'}>{item.status === 'pago' ? 'Pago' : 'Pendente'}</Badge>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
