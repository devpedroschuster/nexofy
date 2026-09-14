import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { LoadingState } from '@/components/ui';
import type { FinanceiroStackParamList } from '@/navigation';

// Checkout hospedado pela Asaas (PIX copia-e-cola + cartão já incluídos na
// própria página) — decisão da spec: sem captura de pagamento nativa no V1.
export default function PagamentoWebViewScreen() {
  const route = useRoute<RouteProp<FinanceiroStackParamList, 'PagamentoWebView'>>();
  const { url } = route.params;

  return (
    <View className="flex-1">
      <WebView source={{ uri: url }} startInLoadingState renderLoading={() => <LoadingState label="Abrindo pagamento..." />} />
    </View>
  );
}
