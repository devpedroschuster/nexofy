import React, { useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import {
  useAtualizarPerfil,
  useExportarDados,
  useMeuPerfil,
  useSolicitarExclusao,
  useUploadAvatar,
} from '@/features/aluno';
import { sair } from '@/features/auth';
import { Body, Button, Card, Display, ErrorState, LoadingState } from '@/components/ui';
import { fonts } from '@/lib/typography';
import { useThemeStore } from '@/lib/theme';

function iniciais(nome?: string) {
  if (!nome) return 'A';
  const partes = nome.trim().split(' ');
  return partes.length >= 2 ? (partes[0][0] + partes[1][0]).toUpperCase() : partes[0].slice(0, 2).toUpperCase();
}
function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function PerfilScreen() {
  const { tokens } = useThemeStore();
  const { data: aluno, isLoading, isError, error, refetch } = useMeuPerfil();

  const [modoEdicao, setModoEdicao] = useState(false);
  const [form, setForm] = useState({ telefone: '', cpf: '', data_nascimento: '' });

  const atualizarPerfil = useAtualizarPerfil(aluno?.id, aluno?.auth_id);
  const uploadAvatar = useUploadAvatar(aluno?.id, aluno?.auth_id);
  const exportarDados = useExportarDados();
  const solicitarExclusao = useSolicitarExclusao(aluno?.id, aluno?.estudio_id);

  if (isLoading) return <LoadingState label="Carregando perfil..." />;
  if (isError || !aluno) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState mensagem={error instanceof Error ? error.message : 'Tente novamente.'} onRetry={() => refetch()} />
      </View>
    );
  }

  const iniciarEdicao = () => {
    setForm({
      telefone: aluno.telefone ?? '',
      cpf: aluno.cpf ?? '',
      data_nascimento: aluno.data_nascimento ?? '',
    });
    setModoEdicao(true);
  };

  const handleSalvar = async () => {
    try {
      await atualizarPerfil.mutateAsync(form);
      setModoEdicao(false);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar. Tente novamente.');
    }
  };

  const handleTrocarFoto = async () => {
    const permissao = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissao.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para trocar o avatar.');
      return;
    }
    const resultado = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (resultado.canceled) return;
    const asset = resultado.assets[0];
    const fileExt = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    try {
      await uploadAvatar.mutateAsync({ uri: asset.uri, fileExt });
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar a imagem.');
    }
  };

  const handleExportarDados = async () => {
    try {
      await exportarDados.mutateAsync();
      Alert.alert('Pronto', 'Seus dados foram exportados. Em breve o compartilhamento do arquivo será adicionado.');
    } catch {
      Alert.alert('Erro', 'Não foi possível exportar seus dados agora.');
    }
  };

  const handleSolicitarExclusao = () => {
    Alert.alert(
      'Solicitar exclusão',
      'Isso envia um pedido de exclusão dos seus dados para o estúdio. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'destructive',
          onPress: async () => {
            try {
              await solicitarExclusao.mutateAsync();
              Alert.alert('Enviado', 'Solicitação enviada. O estúdio entrará em contato.');
            } catch {
              Alert.alert('Erro', 'Não foi possível registrar sua solicitação agora.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: '#FDF8F5' }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Card>
        <View className="items-center">
          <View className="relative">
            <View
              className="w-24 h-24 rounded-3xl items-center justify-center overflow-hidden"
              style={{ backgroundColor: tokens.priLight }}
            >
              {aluno.avatar_url ? (
                <Image source={{ uri: aluno.avatar_url }} className="w-24 h-24" />
              ) : (
                <Display style={{ color: tokens.priText, fontSize: 24, fontFamily: fonts.displayBlack }}>
                  {iniciais(aluno.nome_completo)}
                </Display>
              )}
            </View>
            <View
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: tokens.pri }}
              onTouchEnd={handleTrocarFoto}
            >
              <Camera color={tokens.priText} size={14} />
            </View>
          </View>
          <Text style={{ fontFamily: fonts.displayBold, fontSize: 18, color: '#0A0A1A', marginTop: 12 }}>{aluno.nome_completo}</Text>
          <Body style={{ color: '#9ca3af', fontSize: 13 }}>{aluno.planos?.nome ?? 'Sem plano ativo'}</Body>
          {aluno.planos && <Body style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>{formatarMoeda(aluno.planos.preco)}/mês</Body>}
        </View>
      </Card>

      <Card>
        <View className="flex-row justify-between items-center mb-4">
          <Body style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>Dados pessoais</Body>
          {!modoEdicao && (
            <Body onPress={iniciarEdicao} style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: tokens.pri }}>
              Editar
            </Body>
          )}
        </View>

        <Body style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>E-mail</Body>
        <Body style={{ fontFamily: fonts.bodySemibold, color: '#374151', marginBottom: 12 }}>{aluno.email}</Body>

        <Body style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Telefone</Body>
        {modoEdicao ? (
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-2 mb-3"
            value={form.telefone}
            onChangeText={(v) => setForm((f) => ({ ...f, telefone: v }))}
            placeholder="(00) 00000-0000"
          />
        ) : (
          <Body style={{ fontFamily: fonts.bodySemibold, color: '#374151', marginBottom: 12 }}>{aluno.telefone ?? 'Não informado'}</Body>
        )}

        <Body style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>CPF</Body>
        {modoEdicao ? (
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-2 mb-3"
            value={form.cpf}
            onChangeText={(v) => setForm((f) => ({ ...f, cpf: v }))}
            placeholder="000.000.000-00"
          />
        ) : (
          <Body style={{ fontFamily: fonts.bodySemibold, color: '#374151', marginBottom: 12 }}>{aluno.cpf ?? 'Não informado'}</Body>
        )}

        <Body style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>Data de nascimento</Body>
        {modoEdicao ? (
          <TextInput
            className="border border-gray-200 rounded-xl px-3 py-2"
            value={form.data_nascimento}
            onChangeText={(v) => setForm((f) => ({ ...f, data_nascimento: v }))}
            placeholder="AAAA-MM-DD"
          />
        ) : (
          <Body style={{ fontFamily: fonts.bodySemibold, color: '#374151' }}>{aluno.data_nascimento ?? 'Não informado'}</Body>
        )}

        {modoEdicao && (
          <View className="flex-row gap-3 mt-4">
            <View className="flex-1">
              <Button variant="outline" onPress={() => setModoEdicao(false)}>Cancelar</Button>
            </View>
            <View className="flex-1">
              <Button loading={atualizarPerfil.isPending} onPress={handleSalvar}>Salvar</Button>
            </View>
          </View>
        )}
      </Card>

      <Card>
        <Body style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Meus dados (LGPD)</Body>
        <Body style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
          Baixe uma cópia dos seus dados ou solicite a exclusão da sua conta.
        </Body>
        <View className="gap-3">
          <Button variant="outline" loading={exportarDados.isPending} onPress={handleExportarDados}>
            Baixar meus dados
          </Button>
          <Button variant="danger" loading={solicitarExclusao.isPending} onPress={handleSolicitarExclusao}>
            Solicitar exclusão da conta
          </Button>
        </View>
      </Card>

      <Button variant="outline" onPress={sair}>Sair</Button>
    </ScrollView>
  );
}
