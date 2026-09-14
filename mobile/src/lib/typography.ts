// Sistema tipográfico do app — display (Plus Jakarta Sans) para títulos e
// números grandes, corpo (Inter) para texto corrido/labels. Duas famílias,
// papéis bem separados — nunca misturadas na mesma peça de texto.

export const fonts = {
  displayBlack: 'PlusJakartaSans_800ExtraBold',
  displayBold: 'PlusJakartaSans_700Bold',
  displaySemibold: 'PlusJakartaSans_600SemiBold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

// Escala de espaçamento única do app — evita cada tela inventar seu próprio
// padding/gap (o que já tinha acontecido copiando valores soltos do webapp).
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  md: 16,
  lg: 20,
  xl: 24,
} as const;
