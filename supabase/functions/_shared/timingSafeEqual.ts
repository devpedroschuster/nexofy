// _shared/timingSafeEqual.ts
//
// PED-171 — o Asaas não assina webhooks por HMAC (confirmado na documentação
// oficial: https://docs.asaas.com/docs/sobre-os-webhooks — só existe o token
// estático "asaas-access-token"), então a defesa possível aqui não é trocar
// de mecanismo, é blindar a comparação do token contra timing attack: um
// `!==`/`===` de string compara byte a byte e retorna assim que encontra a
// primeira diferença, então o tempo de resposta vaza quantos caracteres
// iniciais do token um atacante já acertou, permitindo redescobrir o token
// certo caractere por caractere.
//
// Em vez de comparar os tokens diretamente, cada um é primeiro hasheado
// (SHA-256) — o hash tem tamanho fixo (32 bytes) independente do tamanho do
// token original, e a comparação byte a byte usa OR bit a bit acumulado em
// vez de early-return, então o tempo de execução não depende de onde (nem
// se) os hashes divergem.
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ])
  const bytesA = new Uint8Array(hashA)
  const bytesB = new Uint8Array(hashB)

  let diferenca = 0
  for (let i = 0; i < bytesA.length; i++) {
    diferenca |= bytesA[i] ^ bytesB[i]
  }
  return diferenca === 0
}
