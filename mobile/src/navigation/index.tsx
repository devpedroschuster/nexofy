import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Calendar, CreditCard, Home, User } from 'lucide-react-native';
import { useSession } from '@/features/auth';
import { useEstudioDoAluno, useMeuPerfil } from '@/features/aluno';
import { useThemeStore } from '@/lib/theme';
import { LoadingState } from '@/components/ui';
import LoginScreen from '@/screens/Auth/LoginScreen';
import DashboardScreen from '@/screens/Dashboard/DashboardScreen';
import AgendaScreen from '@/screens/Agenda/AgendaScreen';
import FinanceiroScreen from '@/screens/Financeiro/FinanceiroScreen';
import PagamentoWebViewScreen from '@/screens/Financeiro/PagamentoWebViewScreen';
import PerfilScreen from '@/screens/Perfil/PerfilScreen';

export type FinanceiroStackParamList = {
  HistoricoMensalidades: undefined;
  PagamentoWebView: { url: string };
};

const AuthStackNav = createNativeStackNavigator();
function AuthStack() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login" component={LoginScreen} />
    </AuthStackNav.Navigator>
  );
}

const FinanceiroStackNav = createNativeStackNavigator<FinanceiroStackParamList>();
function FinanceiroStack() {
  return (
    <FinanceiroStackNav.Navigator>
      <FinanceiroStackNav.Screen
        name="HistoricoMensalidades"
        component={FinanceiroScreen}
        options={{ headerShown: false }}
      />
      <FinanceiroStackNav.Screen
        name="PagamentoWebView"
        component={PagamentoWebViewScreen}
        options={{ title: 'Pagamento', presentation: 'modal' }}
      />
    </FinanceiroStackNav.Navigator>
  );
}

const Tab = createBottomTabNavigator();
function AppTabs() {
  const { tokens } = useThemeStore();
  const { data: aluno } = useMeuPerfil();
  const { data: estudio } = useEstudioDoAluno(aluno?.estudio_id);

  // Abas filtradas por estudio.modulos_ativos — mesmo mecanismo do webapp
  // pra esconder módulos que o estúdio não contratou/ativou. Dashboard e
  // Perfil são sempre visíveis (não são "módulos" opcionais).
  const modulos = estudio?.modulos_ativos ?? ['agenda', 'financeiro'];
  const mostrarAgenda = modulos.includes('agenda');
  const mostrarFinanceiro = modulos.includes('financeiro');

  return (
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
          component={AgendaScreen}
          options={{ tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }}
        />
      )}
      {mostrarFinanceiro && (
        <Tab.Screen
          name="Financeiro"
          component={FinanceiroStack}
          options={{ tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} /> }}
        />
      )}
      <Tab.Screen
        name="Perfil"
        component={PerfilScreen}
        options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { session, carregando } = useSession();

  if (carregando) return <LoadingState label="Verificando sessão..." />;

  return <NavigationContainer>{session ? <AppTabs /> : <AuthStack />}</NavigationContainer>;
}
