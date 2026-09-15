// mobile-pro/src/screens/Dashboard/DashboardAdmin.tsx
import React from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AlertCircle, MessageCircle, Users, Wallet } from 'lucide-react-native';
import { useDashboardAdmin } from '@/features/dashboard';
import { useThemeStore } from '@/lib/theme';
import { Body, Card, CardSkeleton, Display, ErrorState, LoadingState } from '@/components/ui';
import { fonts } from '@/lib/typography';
import { gerarLinkWhatsApp } from '@/lib/whatsapp';

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DashboardAdmin({ estudioId }: { estudioId: string }) {
  const { tokens } = useThemeStore();
  const { data, isLoading, isError, error, refetch } = useDashboardAdmin(estudioId);

  if (isLoading) return <LoadingState label="Carregando painel..." />;
  if (isError || !data) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState mensagem={error instanceof Error ? error.message : 'Tente novamente.'} onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#FDF8F5' }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
    >
      <Display style={{ fontSize: 24 }}>Painel do estúdio</Display>

      <View className="flex-row gap-3">
        <Card className="flex-1">
          <Wallet color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', marginTop: 8 }}>
            Receita do mês
          </Text>
          <Display style={{ fontSize: 18, marginTop: 4 }}>{formatarMoeda(data.faturamentoMes)}</Display>
        </Card>
        <Card className="flex-1">
          <Users color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', marginTop: 8 }}>
            Alunos ativos
          </Text>
          <Display style={{ fontSize: 18, marginTop: 4 }}>{data.totalAlunos}</Display>
        </Card>
      </View>

      <Card>
        <View className="flex-row items-center gap-2 mb-3">
          <AlertCircle color="#dc2626" size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>
            Em atraso · {data.inadimplentes.length}
          </Text>
        </View>
        {data.inadimplentes.length === 0 ? (
          <Body style={{ color: '#9ca3af' }}>Nenhum pagamento em atraso. 🎉</Body>
        ) : (
          data.inadimplentes.slice(0, 8).map((item) => {
            const link = gerarLinkWhatsApp(
              item.alunos?.telefone,
              `Olá, ${item.alunos?.nome_completo?.split(' ')[0] ?? ''}! Seu pagamento de ${formatarMoeda(Number(item.valor_pago ?? 0))} está em aberto. Podemos verificar juntos?`
            );
            return (
              <View key={item.id} className="flex-row items-center justify-between py-2 border-b border-gray-100">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-gray-800">{item.alunos?.nome_completo ?? '—'}</Text>
                  <Text className="text-xs text-gray-400">{formatarMoeda(Number(item.valor_pago ?? 0))}</Text>
                </View>
                {link && (
                  <Text
                    onPress={() => Linking.openURL(link)}
                    style={{ color: '#16a34a', fontFamily: fonts.bodyBold, fontSize: 12 }}
                  >
                    <MessageCircle size={13} /> Cobrar
                  </Text>
                )}
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}
