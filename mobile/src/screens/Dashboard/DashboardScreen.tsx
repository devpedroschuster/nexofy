import React from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { CalendarClock, CheckCircle2, Clock } from 'lucide-react-native';
import { useMeuPerfil, useEstudioDoAluno } from '@/features/aluno';
import { useProximaAula, useCancelarAgendamento } from '@/features/agenda';
import { useMensalidades, statusExibicao } from '@/features/financeiro';
import { useThemeStore } from '@/lib/theme';
import { Badge, Body, Button, Card, CardSkeleton, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { fonts, space } from '@/lib/typography';

function formatarDataHora(dataIso: string, horario: string) {
  const data = new Date(`${dataIso}T00:00:00`);
  const dataFmt = data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return `${dataFmt} às ${horario?.substring(0, 5)}`;
}

export default function DashboardScreen() {
  const { tokens } = useThemeStore();

  const {
    data: aluno,
    isLoading: carregandoAluno,
    isError: erroAluno,
    error: erroAlunoDetalhe,
    refetch: refetchAluno,
  } = useMeuPerfil();

  const { data: estudio } = useEstudioDoAluno(aluno?.estudio_id);

  const {
    data: proximaAula,
    isLoading: carregandoAula,
    isError: erroAula,
    refetch: refetchAula,
  } = useProximaAula(aluno?.id, aluno?.estudio_id);

  const { data: mensalidades, isLoading: carregandoFinanceiro } = useMensalidades(aluno?.id, aluno?.estudio_id);

  const cancelarMutation = useCancelarAgendamento(aluno?.id, aluno?.estudio_id);

  // Loading geral — só o perfil bloqueia a tela inteira (aula/financeiro têm
  // seus próprios estados, a tela não trava esperando os três).
  if (carregandoAluno) {
    return <LoadingState label="Carregando seus dados..." />;
  }

  if (erroAluno || !aluno) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState
          mensagem={erroAlunoDetalhe instanceof Error ? erroAlunoDetalhe.message : 'Tente novamente em instantes.'}
          onRetry={() => refetchAluno()}
        />
      </View>
    );
  }

  const mensalidadeAtual = mensalidades?.[0];
  const statusFinanceiro = mensalidadeAtual
    ? statusExibicao(mensalidadeAtual.status, mensalidadeAtual.data_vencimento)
    : null;

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#FDF8F5' }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refetchAluno(); refetchAula(); }} />}
    >
      <View>
        <Display style={{ fontSize: 24 }}>Olá, {aluno.nome_completo?.split(' ')[0]} 👋</Display>
        <Body style={{ color: '#9ca3af', marginTop: 2 }}>{estudio?.nome ?? 'Carregando estúdio...'}</Body>
      </View>

      {/* Próxima aula — momento de assinatura: barra de destaque na cor do
          estúdio + horário em tipografia grande, é a primeira coisa que o
          aluno quer saber ao abrir o app. */}
      {carregandoAula ? (
        <CardSkeleton />
      ) : erroAula ? (
        <ErrorState mensagem="Não foi possível carregar sua próxima aula." onRetry={() => refetchAula()} />
      ) : !proximaAula ? (
        <Card>
          <View className="flex-row items-center gap-2 mb-3">
            <CalendarClock color={tokens.pri} size={18} />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
              Próxima aula
            </Text>
          </View>
          <EmptyState
            titulo="Nada marcado ainda"
            descricao="Abra a aba Agenda e escolha um horário — sua vaga fica reservada na hora."
          />
        </Card>
      ) : (
        <View className="bg-white border border-gray-100 overflow-hidden flex-row" style={{ borderRadius: 24 }}>
          <View style={{ width: 6, backgroundColor: tokens.pri }} />
          <View style={{ flex: 1, padding: 20 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
              Sua próxima aula
            </Text>
            <Display style={{ fontSize: 22, marginTop: space.xs }}>{proximaAula.atividade}</Display>
            <View className="flex-row items-center gap-1 mt-2">
              <Clock color={tokens.pri} size={15} />
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: tokens.pri }}>
                {formatarDataHora(proximaAula.data_aula, proximaAula.horario)}
              </Text>
            </View>
            {proximaAula.professores?.nome && (
              <Body style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>Prof. {proximaAula.professores.nome}</Body>
            )}
            <View className="mt-4">
              <Button
                variant="danger"
                loading={cancelarMutation.isPending}
                onPress={() => cancelarMutation.mutate({ aulaId: proximaAula.id, dataAula: proximaAula.data_aula })}
              >
                Cancelar agendamento
              </Button>
            </View>
            {cancelarMutation.isError && (
              <Body style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>
                {cancelarMutation.error instanceof Error
                  ? cancelarMutation.error.message
                  : 'Não deu pra cancelar — confira o prazo mínimo de antecedência do estúdio.'}
              </Body>
            )}
          </View>
        </View>
      )}

      {/* Status financeiro simplificado */}
      {carregandoFinanceiro ? (
        <CardSkeleton />
      ) : (
        <Card>
          <View className="flex-row items-center gap-2 mb-3">
            <CheckCircle2 color={tokens.pri} size={18} />
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1 }}>
              Status financeiro
            </Text>
          </View>
          {!mensalidadeAtual ? (
            <Body style={{ color: '#9ca3af' }}>Nenhuma cobrança registrada ainda.</Body>
          ) : (
            <View className="flex-row items-center justify-between">
              <Body style={{ color: '#374151', fontFamily: fonts.bodySemibold }}>
                {statusFinanceiro === 'Pago' ? 'Mensalidade em dia' : 'Você tem uma pendência'}
              </Body>
              <Badge tone={statusFinanceiro === 'Pago' ? 'ok' : statusFinanceiro === 'Atrasado' ? 'err' : 'warn'}>
                {statusFinanceiro}
              </Badge>
            </View>
          )}
        </Card>
      )}
    </ScrollView>
  );
}
