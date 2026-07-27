import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';

const DURACAO_SEGUNDOS = 2;

export default function PaginaNaoEncontrada({ destino = '/' }) {
  const navigate = useNavigate();
  const [contador, setContador] = useState(DURACAO_SEGUNDOS);

  // Segurança: garante que `destino` é um caminho interno relativo,
  // evitando open-redirect caso o valor venha de fonte não confiável.
  const destinoSeguro = destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';

  useEffect(() => {
    if (contador <= 0) return;

    const timer = setTimeout(() => {
      if (contador === 1) {
        navigate(destinoSeguro, { replace: true });
      } else {
        setContador((c) => c - 1);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [contador, navigate, destinoSeguro]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-6 bg-background px-6 text-center">
      <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
        <MapPin size={32} className="text-muted-foreground" />
      </div>

      <div className="space-y-1">
        <h1 className="text-4xl font-black text-foreground tracking-tight">404</h1>
        <p className="text-lg font-bold text-foreground">Página não encontrada</p>
        <p className="text-sm text-muted-foreground">
          Esta rota não existe. Redirecionando em{' '}
          <span className="font-bold text-primary">{contador}s</span>…
        </p>
      </div>
    </div>
  );
}