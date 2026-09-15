// mobile-pro/src/navigation/index.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Calendar, CreditCard, Home, User, Users } from 'lucide-react-native';
import { SessaoContext, useSessaoComPapel, type SessaoAtual } from '@/features/auth';
import { useEstudio } from '@/features/estudio';
import { useThemeStore } from '@/lib/theme';
import { LoadingState } from '@/components/ui';
import LoginScreen from '@/screens/Auth/LoginScreen';
import PapelNaoSuportadoScreen from '@/screens/PapelNaoSuportado/PapelNaoSuportadoScreen';
import DashboardScreen from '@/screens/Dashboard/DashboardScreen';
import AgendaScreen from '@/screens/Agenda/AgendaScreen';
import ChamadaScreen from '@/screens/Agenda/ChamadaScreen';
import AlunosScreen from '@/screens/Alunos/AlunosScreen';
import FinanceiroScreen from '@/screens/Financeiro/FinanceiroScreen';
import PerfilScreen from '@/screens/Perfil/PerfilScreen';

export type AgendaStackParamList = {
  ListaAulas: undefined;
  Chamada: { aulaId: number; dataAula: string; atividade: string; horario: string };
};

const AuthStackNav = createNativeStackNavigator();
function AuthStack() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login" component={LoginScreen} />
    </AuthStackNav.Navigator>
  );
}

const AgendaStackNav = createNativeStackNavigator<AgendaStackParamList>();
function AgendaStack() {
  return (
    <AgendaStackNav.Navigator>
      <AgendaStackNav.Screen name="ListaAulas" component={AgendaScreen} options={{ headerShown: false }} />
      <AgendaStackNav.Screen
        name="Chamada"
        component={ChamadaScreen}
        options={({ route }) => ({ title: route.params.atividade, presentation: 'modal' })}
      />
    </AgendaStackNav.Navigator>
  );
}

const Tab = createBottomTabNavigator();
function AppTabs({ sessao }: { sessao: SessaoAtual }) {
  const { tokens } = useThemeStore();
  const { data: estudio } = useEstudio(sessao.estudioId);

  const modulos = estudio?.modulos_ativos ?? ['agenda', 'financeiro', 'alunos'];
  const mostrarAgenda = modulos.includes('agenda');
  const mostrarAlunos = modulos.includes('alunos');
  const mostrarFinanceiro = modulos.includes('financeiro');

  return (
    <SessaoContext.Provider value={sessao}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tokens.pri,
          tabBarInactiveTintColor: '#9ca3af',
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
        />
        {mostrarAgenda && (
          <Tab.Screen
            name="Agenda"
            component={AgendaStack}
            options={{ tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }}
          />
        )}
        {mostrarAlunos && (
          <Tab.Screen
            name="Alunos"
            component={AlunosScreen}
            options={{ tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
          />
        )}
        {mostrarFinanceiro && (
          <Tab.Screen
            name="Financeiro"
            component={FinanceiroScreen}
            options={{ tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} /> }}
          />
        )}
        <Tab.Screen
          name="Perfil"
          component={PerfilScreen}
          options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
        />
      </Tab.Navigator>
    </SessaoContext.Provider>
  );
}

export function RootNavigator() {
  const { papel, estudioId, professorId, nomeUsuario, carregando, papelNaoSuportado } = useSessaoComPapel();

  if (carregando) return <LoadingState label="Verificando sessão..." />;

  let conteudo: React.ReactNode;
  if (!papel && !papelNaoSuportado) {
    conteudo = <AuthStack />;
  } else if (papelNaoSuportado || !papel || !estudioId) {
    conteudo = <PapelNaoSuportadoScreen />;
  } else {
    conteudo = <AppTabs sessao={{ papel, estudioId, professorId, nomeUsuario }} />;
  }

  return <NavigationContainer>{conteudo}</NavigationContainer>;
}
