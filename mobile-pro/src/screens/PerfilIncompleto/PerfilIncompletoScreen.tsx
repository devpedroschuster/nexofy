import React from 'react';
import { View } from 'react-native';
import { sair } from '@/features/auth';
import { Body, Button, Display } from '@/components/ui';

// PED-212: exibida quando o vínculo em estudio_membros é role='professor'
// mas não existe linha correspondente em professores (auth_id não casado).
// Bloqueia explicitamente em vez de deixar professorId nulo silenciosamente
// destravar a visão de gestor (agenda/dashboard do estúdio inteiro).
export default function PerfilIncompletoScreen() {
  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Display style={{ fontSize: 22, marginBottom: 8 }}>Seu cadastro de instrutor está incompleto</Display>
      <Body style={{ color: '#9ca3af', marginBottom: 32 }}>
        Encontramos seu vínculo com o estúdio, mas seu perfil de professor ainda não foi finalizado. Fale com o
        administrador do seu estúdio para concluir seu cadastro.
      </Body>
      <Button variant="outline" onPress={sair}>Sair</Button>
    </View>
  );
}
