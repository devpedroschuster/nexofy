import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSessaoAtual, sair } from '@/features/auth';
import { useEstudio } from '@/features/estudio';
import { Body, Button, Card, Display } from '@/components/ui';

const LABEL_PAPEL: Record<'admin' | 'professor', string> = {
  admin: 'Gestor(a)',
  professor: 'Instrutor(a)',
};

export default function PerfilScreen() {
  const { papel, estudioId, nomeUsuario } = useSessaoAtual();
  const { data: estudio } = useEstudio(estudioId);

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: '#FDF8F5' }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Card>
        <Display style={{ fontSize: 18 }}>{nomeUsuario ?? LABEL_PAPEL[papel]}</Display>
        <Body style={{ color: '#9ca3af', marginTop: 2 }}>{LABEL_PAPEL[papel]}</Body>
        <View className="mt-4">
          <Text className="text-xs text-gray-400 mb-1">Estúdio</Text>
          <Text className="text-gray-700 font-semibold">{estudio?.nome ?? 'Carregando...'}</Text>
        </View>
      </Card>

      <Button variant="outline" onPress={sair}>Sair</Button>
    </ScrollView>
  );
}
