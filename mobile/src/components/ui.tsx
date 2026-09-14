import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View, type TextProps } from 'react-native';
import { AlertCircle, WifiOff } from 'lucide-react-native';
import { useThemeStore } from '@/lib/theme';
import { fonts, radius } from '@/lib/typography';

// Componentes "burros" — nunca chamam Supabase, só recebem props.
// Cor dinâmica vem do useThemeStore (tokens do estúdio logado).

// ── Tipografia ───────────────────────────────────────────────────────────
// Display (Plus Jakarta Sans) para títulos e números grandes; Body (Inter)
// para o resto. Aplicado via style (não className) — mais simples e
// confiável do que ensinar o NativeWind sobre fontes customizadas.
interface AppTextProps extends TextProps {
  children: React.ReactNode;
}
export function Display({ style, ...props }: AppTextProps) {
  return <Text {...props} style={[{ fontFamily: fonts.displayBold, color: '#0A0A1A' }, style]} />;
}
export function Body({ style, ...props }: AppTextProps) {
  return <Text {...props} style={[{ fontFamily: fonts.bodyRegular, color: '#374151' }, style]} />;
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <View
      className={`bg-white border border-gray-100 ${className}`}
      style={{ borderRadius: radius.xl, padding: 20, shadowColor: '#0A0A1A', shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 }}
    >
      {children}
    </View>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'err'; children: React.ReactNode }) {
  const cores = {
    ok: { bg: '#d1fae5', text: '#047857' },
    warn: { bg: '#fef3c7', text: '#b45309' },
    err: { bg: '#fee2e2', text: '#b91c1c' },
  } as const;
  const c = cores[tone];
  return (
    <View style={{ backgroundColor: c.bg, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 }}>
      <Text style={{ fontFamily: fonts.bodySemibold, color: c.text, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

interface ButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'danger';
}
export function Button({ children, onPress, disabled, loading, variant = 'primary' }: ButtonProps) {
  const { tokens } = useThemeStore();
  const isDisabled = disabled || loading;
  const scale = useRef(new Animated.Value(1)).current;

  const pressarDentro = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start();
  const pressarFora = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  const style =
    variant === 'primary'
      ? { backgroundColor: isDisabled ? '#d1d5db' : tokens.pri }
      : variant === 'danger'
        ? { backgroundColor: isDisabled ? '#d1d5db' : '#fee2e2' }
        : { backgroundColor: 'transparent', borderWidth: 1, borderColor: tokens.pri };

  const textColor =
    variant === 'primary' ? tokens.priText : variant === 'danger' ? '#dc2626' : tokens.pri;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={pressarDentro}
        onPressOut={pressarFora}
        disabled={isDisabled}
        style={[{ borderRadius: radius.lg, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }, style]}
      >
        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <Text style={{ color: textColor, fontFamily: fonts.bodySemibold, fontSize: 14 }}>{children}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ── Skeleton (shimmer) ──────────────────────────────────────────────────
// Substitui o spinner genérico nos lugares onde já sabemos o formato do
// conteúdo (card de aula, linha de mensalidade) — reduz a sensação de espera.
export function Skeleton({ width = '100%', height = 16, radius: r = 8 }: { width?: number | string; height?: number; radius?: number }) {
  const opacidade = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacidade, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacidade, { toValue: 0.4, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacidade]);

  return (
    <Animated.View
      style={{ width: width as never, height, borderRadius: r, backgroundColor: '#e5e7eb', opacity: opacidade }}
    />
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <Skeleton width={80} height={12} radius={4} />
      <View style={{ height: 10 }} />
      <Skeleton width="70%" height={20} radius={6} />
      <View style={{ height: 8 }} />
      <Skeleton width="45%" height={14} radius={4} />
    </Card>
  );
}

export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  const { tokens } = useThemeStore();
  return (
    <View className="flex-1 items-center justify-center py-14">
      <ActivityIndicator color={tokens.pri} size="large" />
      <Body style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>{label}</Body>
    </View>
  );
}

export function ErrorState({ mensagem, onRetry }: { mensagem: string; onRetry?: () => void }) {
  return (
    <View className="items-center justify-center py-14 bg-white border border-gray-100" style={{ borderRadius: radius.xl }}>
      <WifiOff color="#fca5a5" size={40} />
      <Display style={{ fontSize: 16, marginTop: 12 }}>Não deu pra carregar agora</Display>
      <Body style={{ color: '#9ca3af', fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
        {mensagem}
      </Body>
      {onRetry && (
        <View className="mt-4">
          <Button onPress={onRetry} variant="outline">Tentar de novo</Button>
        </View>
      )}
    </View>
  );
}

export function EmptyState({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <View className="items-center justify-center py-14 bg-white border border-gray-100" style={{ borderRadius: radius.xl }}>
      <AlertCircle color="#d1d5db" size={40} />
      <Display style={{ fontSize: 16, marginTop: 12 }}>{titulo}</Display>
      <Body style={{ color: '#9ca3af', fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 24 }}>
        {descricao}
      </Body>
    </View>
  );
}
