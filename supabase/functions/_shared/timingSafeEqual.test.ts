// supabase/functions/_shared/timingSafeEqual.test.ts
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { timingSafeEqualString } from "./timingSafeEqual.ts";

Deno.test("timingSafeEqualString retorna true para strings idênticas", async () => {
  assertEquals(await timingSafeEqualString("token-secreto-123", "token-secreto-123"), true);
});

Deno.test("timingSafeEqualString retorna false para strings diferentes de mesmo tamanho", async () => {
  assertEquals(await timingSafeEqualString("token-secreto-123", "token-secreto-124"), false);
});

Deno.test("timingSafeEqualString retorna false para strings de tamanhos diferentes", async () => {
  assertEquals(await timingSafeEqualString("token-curto", "token-bem-mais-longo-que-o-outro"), false);
});

Deno.test("timingSafeEqualString retorna false quando um dos valores é vazio", async () => {
  assertEquals(await timingSafeEqualString("", "token-secreto-123"), false);
  assertEquals(await timingSafeEqualString("token-secreto-123", ""), false);
});

Deno.test("timingSafeEqualString retorna true quando ambos os valores são vazios", async () => {
  assertEquals(await timingSafeEqualString("", ""), true);
});
