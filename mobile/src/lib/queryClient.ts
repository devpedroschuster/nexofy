import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      // Sem refetchOnWindowFocus em RN (não existe "foco de janela" nesse
      // sentido) — o equivalente é refetchOnReconnect, já true por padrão.
    },
  },
});
