import './global.css';
import React, { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useInterFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  useFonts as usePlusJakartaFonts,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { queryClient } from '@/lib/queryClient';
import { useThemeStore } from '@/lib/theme';
import { useMeuPerfil, useEstudioDoAluno } from '@/features/aluno';
import { RootNavigator } from '@/navigation';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Aplica o tema do estúdio assim que o perfil do aluno carrega — roda dentro
// do QueryClientProvider (por isso não fica direto no App()).
function TemaDoEstudio() {
  const { data: aluno } = useMeuPerfil();
  const { data: estudio } = useEstudioDoAluno(aluno?.estudio_id);
  const aplicarTemaDoEstudio = useThemeStore((s) => s.aplicarTemaDoEstudio);
  const resetarTema = useThemeStore((s) => s.resetarTema);

  useEffect(() => {
    if (estudio) aplicarTemaDoEstudio(estudio);
    else resetarTema();
  }, [estudio, aplicarTemaDoEstudio, resetarTema]);

  return null;
}

export default function App() {
  const [interCarregada] = useInterFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [jakartaCarregada] = usePlusJakartaFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const fontesProntas = interCarregada && jakartaCarregada;

  const onLayoutRootView = useCallback(() => {
    if (fontesProntas) SplashScreen.hideAsync().catch(() => {});
  }, [fontesProntas]);

  if (!fontesProntas) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider onLayout={onLayoutRootView}>
        <StatusBar style="dark" />
        <TemaDoEstudio />
        <RootNavigator />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
