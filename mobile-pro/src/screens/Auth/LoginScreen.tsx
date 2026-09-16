import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { entrar } from '@/features/auth';
import { Body, Button, Display } from '@/components/ui';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleEntrar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      // onAuthStateChange (useSession) reage sozinho — sem navigate manual aqui.
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar. Verifique seus dados.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white justify-center px-8"
    >
      <Display style={{ fontSize: 26, marginBottom: 4 }}>Nexofy PRO</Display>
      <Body style={{ color: '#9ca3af', marginBottom: 32 }}>
        Acesso de gestor e instrutor — entre com seu e-mail e senha do Nexofy
      </Body>

      <TextInput
        className="border border-gray-200 rounded-2xl px-4 py-3 mb-3 text-base"
        placeholder="E-mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="border border-gray-200 rounded-2xl px-4 py-3 mb-4 text-base"
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
      />

      {erro && <Body style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{erro}</Body>}

      <Button onPress={handleEntrar} loading={enviando} disabled={!email || !senha}>
        Entrar
      </Button>
    </KeyboardAvoidingView>
  );
}
