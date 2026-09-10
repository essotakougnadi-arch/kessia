# ADR 0046 — Branchement optionnel d'un vrai LLM pour KESSIA AI

**Statut :** accepté · **Date :** 2026-09-10

## Contexte

L'assistant KESSIA AI fonctionne en mode **« règles + données »** (choix
MVP, ADR 0033) :

1. `answerFromData()` — répond avec les **chiffres réels** de
   l'utilisateur (solde, prochaine échéance, marge…). Exact, gratuit,
   déterministe.
2. Base de connaissances — réponses cadrées sur les écrans KESSIA pour
   les questions « comment faire ».
3. Repli générique par module.

Ce mode est fiable mais rigide : il ne comprend pas les reformulations,
ne combine pas plusieurs sujets, ne gère pas la « longue traîne » des
questions. L'utilisateur souhaite pouvoir brancher un vrai LLM, sans
engager de coût tant que la clé API et le budget ne sont pas validés.

## Décision

Ajouter un **3ᵉ étage facultatif** — `lib/ai/llm.ts` — qui n'intervient
que lorsque ni les données ni la base de connaissances ne répondent
précisément (`kb.source === 'fallback'` ou `'kb'`), et **uniquement si**
les deux variables d'environnement sont posées :

```
ANTHROPIC_API_KEY   présent
KESSIA_AI_LLM = "1" (opt-in explicite)
```

Sans ces deux conditions, `llmConfigured()` est `false` et **aucun appel
réseau n'est fait** — comportement strictement identique à aujourd'hui.

### Garde-fous

- **SDK officiel** `@anthropic-ai/sdk` (import dynamique, pour ne pas
  alourdir le bundle des routes qui ne l'utilisent pas).
- Prompt système strict : répond en français, 4 phrases max, **n'invente
  aucun chiffre** (n'utilise que le `grounding` fourni — la réponse de
  référence des données/KB), **aucune promesse de rendement**, pas de
  conseil individualisé, oriente vers les vrais écrans.
- `grounding` = la réponse déjà calculée est passée en contexte → le LLM
  reformule/enrichit sans halluciner.
- Timeout 12 s, `max_tokens` 700. Toute erreur/temporisation →
  `llmAnswer` renvoie `null` → on retombe sur les règles.
- La source (`data` / `kb` / `fallback` / `llm`) est tracée dans
  `AiMessage.metadata.source` — les KPI back-office (§54) montrent donc
  la part de réponses LLM.

### Coût / modèle

`KESSIA_AI_MODEL` (défaut `claude-opus-5`). Pour un assistant de chat à
volume, `claude-haiku-4-5` (~$1 / $5 le M tokens) ou `claude-sonnet-5`
sont nettement moins chers — c'est le réglage à faire au moment de
**valider le budget**. Réglage effort/thinking : à ajouter après un bump
du SDK (`output_config: { effort: 'low' }`).

## Conséquences

- Zéro impact tant que `KESSIA_AI_LLM ≠ "1"`. `@anthropic-ai/sdk` ajouté
  aux dépendances (dormant).
- Le jour où la clé est fournie : poser les 2 (3) variables sur Vercel,
  redéployer. Rien d'autre à coder.
- `.env.example` documente l'activation et le compromis de coût.

## Vérification

`tsc` + `lint` + `vitest` (**182**, +4 : `lib/ai/llm.test.ts`) + `build`
OK. Le parcours E2E de l'assistant (`navigation.spec.ts`) reste vert
(LLM désactivé → règles).
