// supabase/functions/_shared/backgroundTask.test.ts
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { runInBackground, __setEdgeRuntimeForTest } from "./backgroundTask.ts";

Deno.test("runInBackground executa a task e a repassa para EdgeRuntime.waitUntil quando disponível", async () => {
  let promisePassada: Promise<unknown> | null = null;
  __setEdgeRuntimeForTest({
    waitUntil: (p: Promise<unknown>) => { promisePassada = p; },
  });

  let executou = false;
  runInBackground(async () => { executou = true; }, "teste");

  if (!promisePassada) throw new Error("waitUntil não foi chamado");
  await promisePassada;
  assertEquals(executou, true);

  __setEdgeRuntimeForTest(undefined);
});

Deno.test("runInBackground não lança quando a task falha (erro é engolido e reportado)", async () => {
  let promisePassada: Promise<unknown> | null = null;
  __setEdgeRuntimeForTest({
    waitUntil: (p: Promise<unknown>) => { promisePassada = p; },
  });

  runInBackground(async () => { throw new Error("falhou de propósito"); }, "teste-erro");

  if (!promisePassada) throw new Error("waitUntil não foi chamado");
  await promisePassada;

  __setEdgeRuntimeForTest(undefined);
});
