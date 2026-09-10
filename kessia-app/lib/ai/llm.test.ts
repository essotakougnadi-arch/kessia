import { describe, it, expect, afterEach } from 'vitest';
import { llmConfigured, llmAnswer } from './llm';

const saved = { key: process.env.ANTHROPIC_API_KEY, flag: process.env.KESSIA_AI_LLM };
afterEach(() => {
  process.env.ANTHROPIC_API_KEY = saved.key;
  process.env.KESSIA_AI_LLM = saved.flag;
});

describe('llmConfigured', () => {
  it('faux sans clé', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.KESSIA_AI_LLM = '1';
    expect(llmConfigured()).toBe(false);
  });
  it('faux si le drapeau n’est pas exactement "1"', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.KESSIA_AI_LLM = 'true';
    expect(llmConfigured()).toBe(false);
  });
  it('vrai avec clé + drapeau', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.KESSIA_AI_LLM = '1';
    expect(llmConfigured()).toBe(true);
  });
});

describe('llmAnswer', () => {
  it('renvoie null quand le LLM n’est pas configuré (pas d’appel réseau)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.KESSIA_AI_LLM = '0';
    expect(await llmAnswer({ message: 'bonjour', aiContext: 'GENERAL' })).toBeNull();
  });
});
