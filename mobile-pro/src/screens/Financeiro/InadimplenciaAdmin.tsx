// mobile-pro/src/screens/Financeiro/InadimplenciaAdmin.tsx
import React from 'react';
import { FlatList, Linking, Text, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useInadimplencia } from '@/features/financeiro';
import { Card, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { gerarLinkWhatsApp } from '@/lib/whatsapp';

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function InadimplenciaAdmin({ estudioId }: { estudioId: string }) {
  const { data: itens, isLoading, isError, refetch } = useInadimplencia(estudioId);

  if (isLoading) return <LoadingState label="Carregando inadimplência..." />;
  if (isError || !itens) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState mensagem="Não foi possível carregar a inadimplência." onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Inadimplência</Display>
      </View>
      {itens.length === 0 ? (
        <View className="px-5"><EmptyState titulo="Tudo em dia" descricao="Nenhum pagamento em atraso no momento." /></View>
      ) : (
        <FlatList
          data={itens}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => {
            const link = gerarLinkWhatsApp(
              item.alunos?.telefone,
              `Olá, ${item.alunos?.nome_completo?.split(' ')[0] ?? ''}! Seu pagamento de ${formatarMoeda(Number(item.valor_pago ?? 0))} está em aberto. Podemos verificar juntos?`
            );
            return (
              <Card className="mb-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-bold text-gray-800">{item.alunos?.nome_completo ?? '—'}</Text>
                    <Text className="text-xs text-gray-400 mt-1">
                      Venc: {new Date(`${item.data_vencimento}T12:00:00`).toLocaleDateString('pt-BR')} · {formatarMoeda(Number(item.valor_pago ?? 0))}
                    </Text>
                  </View>
                  {link && (
                    <Text onPress={() => Linking.openURL(link)} style={{ color: '#16a34a' }} className="text-xs font-bold">
                      <MessageCircle size={13} /> Cobrar
                    </Text>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
