import React, { useState } from 'react';
import { FlatList, Linking, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useSessaoAtual } from '@/features/auth';
import { useAlunosDoEstudio, useMeusAlunos, type AlunoResumo } from '@/features/alunos';
import { Badge, Card, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { formatarWhatsApp } from '@/lib/whatsapp';

function LinhaAluno({ aluno }: { aluno: AlunoResumo }) {
  const whatsapp = formatarWhatsApp(aluno.telefone);
  return (
    <Card className="mb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-bold text-gray-800">{aluno.nome_completo}</Text>
          {aluno.planos?.nome && <Text className="text-xs text-gray-400 mt-1">{aluno.planos.nome}</Text>}
        </View>
        <Badge tone={aluno.status_pagamento === 'atrasado' ? 'err' : 'ok'}>
          {aluno.status_pagamento === 'atrasado' ? 'Atrasado' : 'Em dia'}
        </Badge>
      </View>
      {whatsapp && (
        <Text
          onPress={() => Linking.openURL(`https://wa.me/${whatsapp}`)}
          className="text-xs text-emerald-600 font-bold mt-3"
        >
          Abrir WhatsApp
        </Text>
      )}
    </Card>
  );
}

export default function AlunosScreen() {
  const { papel, estudioId, professorId } = useSessaoAtual();
  const [busca, setBusca] = useState('');

  const queryAdmin = useAlunosDoEstudio(papel === 'admin' ? estudioId : null, busca);
  const queryProfessor = useMeusAlunos(papel === 'professor' ? professorId : null, estudioId, busca);
  const { data: alunos, isLoading, isError, refetch } = papel === 'admin' ? queryAdmin : queryProfessor;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>{papel === 'admin' ? 'Alunos' : 'Meus alunos'}</Display>
      </View>

      <View className="px-5 pb-2">
        <View className="flex-row items-center border border-gray-200 rounded-2xl px-3 bg-white">
          <Search size={16} color="#9ca3af" />
          <TextInput
            className="flex-1 px-2 py-3 text-sm"
            placeholder="Buscar por nome..."
            value={busca}
            onChangeText={setBusca}
          />
        </View>
      </View>

      {isLoading ? (
        <LoadingState label="Carregando alunos..." />
      ) : isError ? (
        <View className="px-5"><ErrorState mensagem="Não foi possível carregar os alunos." onRetry={() => refetch()} /></View>
      ) : !alunos || alunos.length === 0 ? (
        <View className="px-5">
          <EmptyState
            titulo="Nenhum aluno encontrado"
            descricao={papel === 'admin' ? 'Nenhum aluno ativo no estúdio ainda.' : 'Você ainda não tem alunos nas suas modalidades.'}
          />
        </View>
      ) : (
        <FlatList
          data={alunos}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => <LinhaAluno aluno={item} />}
        />
      )}
    </View>
  );
}
