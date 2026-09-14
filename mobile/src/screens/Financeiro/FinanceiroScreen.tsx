import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMeuPerfil } from '@/features/aluno';
import { useGerarCobranca, useMensalidades, statusExibicao } from '@/features/financeiro';
import { Badge, Body, Button, Card, CardSkeleton, Display, EmptyState, ErrorState } from '@/components/ui';
import { fonts } from '@/lib/typography';
import type { Mensalidade } from '@/types';
import type { FinanceiroStackParamList } from '@/navigation';

function formatarMoeda(valor: number | null) {
  if (valor == null) return '—';
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatarData(dataStr: string) {
  return new Date(`${dataStr}T00:00:00`).toLocaleDateString('pt-BR');
}

function MensalidadeCard({ mensalidade }: { mensalidade: Mensalidade }) {
  const navigation = useNavigation<NativeStackNavigationProp<FinanceiroStackParamList>>();
  const gerarCobranca = useGerarCobranca();
  const status = statusExibicao(mensalidade.status, mensalidade.data_vencimento);
  const tone = status === 'Pago' ? 'ok' : status === 'Atrasado' ? 'err' : 'warn';

  const handlePagar = async () => {
    if (mensalidade.link_pagamento) {
      navigation.navigate('PagamentoWebView', { url: mensalidade.link_pagamento });
      return;
    }
    const resultado = await gerarCobranca.mutateAsync(mensalidade);
    navigation.navigate('PagamentoWebView', { url: resultado.link_pagamento });
  };

  return (
    <Card className="mb-3">
      <View className="flex-row justify-between items-center">
        <View>
          <Text style={{ fontFamily: fonts.displaySemibold, fontSize: 15, color: '#0A0A1A' }}>
            {formatarData(mensalidade.data_vencimento)}
          </Text>
          <Body style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
            {formatarMoeda(mensalidade.valor_pago ?? mensalidade.valor_cobranca)}
          </Body>
        </View>
        <Badge tone={tone}>{status}</Badge>
      </View>

      {status !== 'Pago' && (
        <View className="mt-3">
          <Button variant="outline" loading={gerarCobranca.isPending} onPress={handlePagar}>
            Pagar agora
          </Button>
        </View>
      )}
      {gerarCobranca.isError && (
        <Body style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>
          Não deu pra gerar o link de pagamento agora. Tenta de novo em instantes.
        </Body>
      )}
    </Card>
  );
}

export default function FinanceiroScreen() {
  const { data: aluno, isLoading: carregandoAluno } = useMeuPerfil();
  const {
    data: mensalidades,
    isLoading: carregandoMensalidades,
    isError: erroMensalidades,
    refetch,
  } = useMensalidades(aluno?.id, aluno?.estudio_id);

  const carregando = carregandoAluno || carregandoMensalidades;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Mensalidades</Display>
        <Body style={{ color: '#9ca3af', marginTop: 2 }}>Histórico e status dos seus pagamentos</Body>
      </View>

      {carregando ? (
        <View className="px-5 pt-2" style={{ gap: 12 }}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : erroMensalidades ? (
        <View className="px-5">
          <ErrorState mensagem="Não foi possível carregar suas mensalidades." onRetry={() => refetch()} />
        </View>
      ) : !mensalidades || mensalidades.length === 0 ? (
        <View className="px-5">
          <EmptyState titulo="Tudo limpo por aqui" descricao="Você ainda não tem nenhuma cobrança registrada." />
        </View>
      ) : (
        <FlatList
          data={mensalidades}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => <MensalidadeCard mensalidade={item} />}
        />
      )}
    </View>
  );
}
