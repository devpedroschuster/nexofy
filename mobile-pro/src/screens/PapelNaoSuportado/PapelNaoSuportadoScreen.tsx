import React from 'react';
import { View } from 'react-native';
import { sair } from '@/features/auth';
import { Body, Button, Display } from '@/components/ui';

export default function PapelNaoSuportadoScreen() {
  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Display style={{ fontSize: 22, marginBottom: 8 }}>Este app é exclusivo para gestores e instrutores</Display>
      <Body style={{ color: '#9ca3af', marginBottom: 32 }}>
        Não encontramos um vínculo de gestor ou instrutor pra essa conta neste estúdio. Se você é aluno, use o app
        Área do Aluno. Se acha que isso é um erro, fale com o administrador do seu estúdio.
      </Body>
      <Button variant="outline" onPress={sair}>Sair</Button>
    </View>
  );
}
