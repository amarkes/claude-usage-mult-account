# Claude Usage Multi Account

Extensão para **Visual Studio Code** e **Cursor** que mostra **quota**, **custo estimado** e **histórico de uso** do [Claude Code](https://docs.anthropic.com/en/docs/claude-code), lendo dados **locais** na sua máquina.

Ideal para quem usa **várias pastas** do Claude Code (pessoal, trabalho, clientes) — cada uma com seu próprio diretório de configuração.

## Funcionalidades

| Recurso | Descrição |
|---------|-----------|
| **Status bar** | Quota (5h / 7d ou créditos Team), tempo até reset, custo estimado do dia |
| **Multi-conta** | Conta **Padrão** (`~/.claude`) + pastas que você cadastra; tudo salvo no storage da extensão |
| **Painel** | Barras de quota, gráfico de custo (N dias), tabela por modelo |
| **Sidebar** | Activity Bar → **Claude Usage** → webview **Conta** + árvore **Detalhes** |
| **Alertas** | Notificação ao atingir limites configuráveis (ex.: 70% / 90%) |
| **Custo JSONL** | Parse de `~/.claude/projects/**/*.jsonl` com preços por modelo |
| **API OAuth** | Fallback e refresh de token; cache local após sucesso |
| **Keychain (macOS)** | Lê credenciais OAuth quando não há `.credentials.json` no disco |
| **Contas Team / Enterprise** | Quota via `extra_usage` (créditos) quando `five_hour` / `seven_day` vêm vazios |
| **Cooldown API** | Evita HTTP 429 ao focar a janela ou atualizar com frequência |
| **CSV** | Exporta quota + custos diários |
| **Debug** | Canal de saída `Claude Usage` |

## Requisitos

- VS Code ou Cursor **≥ 1.85**
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) instalado e, para quota via API, sessão OAuth válida
- macOS, Linux ou Windows (Keychain só no macOS)

## Instalação

### Marketplace

Procure por **Claude Usage Multi Account** no marketplace de extensões (publisher: `ClaudeUsageMultAcoount`).

### VSIX local

```bash
bash build.sh
# ou, sem alterar versão/changelog:
npm run compile && npm run package
```

Instale o `.vsix` gerado: **Extensions** → menu `...` → **Install from VSIX...**

### Desenvolvimento

```bash
npm install
npm run compile
# F5 → Extension Development Host
```

## Uso rápido

1. Abra o VS Code/Cursor com o Claude Code já usado nesta máquina.
2. Na **Activity Bar**, clique em **Claude Usage** (ícone pulse).
3. Em **Conta**, use o select ou **Adicionar pasta** para cadastrar onde o Claude guarda config/sessões (ex. `~/.claude-work`, outro path com `CLAUDE_CONFIG_DIR`, etc.).
4. Veja o resumo na **status bar**; abra o painel com **Claude Usage: Abrir painel**.

A conta selecionada é **persistida** e afeta status bar, painel, sidebar e export CSV — nunca mistura dados entre pastas.

### Cadastrar contas

| Tipo | Pode remover? | Descrição |
|------|-------------|-----------|
| **Padrão** | Não | Sempre `~/.claude` (ignora `$CLAUDE_CONFIG_DIR` do terminal) |
| **Customizada** | Sim | Qualquer pasta que você escolher no disco |

Na sidebar **Conta**:

- **Adicionar pasta** — seletor de diretório + nome amigável (ex. “Trabalho”)
- **Remover** — só nas contas que você adicionou

Comandos:

- `Claude Usage: Escolher conta`
- `Claude Usage: Adicionar pasta de conta`
- `Claude Usage: Remover conta cadastrada`
- `Claude Usage: Usar conta padrão (~/.claude)`

> Se você usava a versão antiga com `~/.claude-work` fixo, na primeira abertura essa pasta pode ser migrada automaticamente como conta “Trabalho”.

## Interface

### Status bar

Exemplo: percentual de quota, countdown do reset e custo estimado de hoje. Clique para abrir o painel (quando configurado).

### Painel principal

- Barras de utilização (janela 5h, 7d e/ou créditos **extra usage** em contas Team)
- Gráfico de custo dos últimos dias (configurável)
- Breakdown por modelo (tokens / custo estimado)
- Seletor de conta (mesmo da sidebar)

### Sidebar

- **Conta** — select, botão **Adicionar pasta**, lista com remover
- **Detalhes** — árvore com resumo (quota, custos, links para ações)

Botões na barra da view: trocar conta, atualizar, exportar CSV.

## Fontes de dados

A extensão **não envia** seu código nem histórico de chat para servidores próprios.

| Fonte | O que fornece |
|-------|----------------|
| `vscode-claude-status-cache.json` | Cache de quota escrito pelo ecossistema Claude / extensão oficial |
| `GET https://api.anthropic.com/api/oauth/usage` | Quota via OAuth (com refresh de token) |
| `~/.claude/projects/**/*.jsonl` | Sessões → tokens e custo estimado |
| `stats-cache.json` | Totais do comando `/usage` do CLI (se existir) |
| **Keychain (macOS)** | Tokens OAuth quando não há arquivo de credenciais em disco |

### Quota em contas Team / Enterprise

Em alguns planos a API retorna `five_hour` e `seven_day` como `null`. Nesse caso a extensão usa **`extra_usage`** (créditos / limite de uso extra) para preencher a barra e os alertas.

### Custos estimados

Quando o JSONL não traz `costUSD`, o valor é **estimado** com tabela de preços por modelo (Sonnet, Haiku, Opus, etc.). Use como referência — não substitui a fatura da Anthropic.

## Comandos

| Comando | Ação |
|---------|------|
| `Claude Usage: Atualizar` | Força refresh de quota e custos |
| `Claude Usage: Abrir painel` | Abre o painel com gráficos e quota |
| `Claude Usage: Exportar CSV` | Salva quota + custos diários |
| `Claude Usage: Recalcular custos (JSONL)` | Reprocessa os arquivos JSONL |
| `Claude Usage: Mostrar log de debug` | Abre o Output `Claude Usage` |
| `Claude Usage: Escolher conta` | Quick pick Pessoal / Trabalho |
| `Claude Usage: Usar conta ~/.claude` | Atalho para conta pessoal |
| `Claude Usage: Usar conta ~/.claude-work` | Atalho para conta de trabalho |

## Configurações (`claudeUsage.*`)

Abra **Settings** e filtre por `claude usage`.

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `refreshIntervalSeconds` | `60` | Intervalo de polling (mín. 15s) |
| `preferApi` | `false` | Priorizar API OAuth em vez do cache local |
| `apiOnFocus` | `true` | Tentar atualizar quota ao focar a janela |
| `apiCooldownSeconds` | `90` | Mínimo entre chamadas à API (evita 429) |
| `configProfile` | `default` | Legado — prefira cadastro na sidebar |
| `configDir` | `""` | Força uma pasta fixa (ignora conta da sidebar) |
| `debug` | `false` | Log detalhado no Output |
| `enableAlerts` | `true` | Notificações de quota |
| `alertThresholdWarning` | `0.7` | Limite de atenção (0–1) |
| `alertThresholdCritical` | `0.9` | Limite crítico (0–1) |
| `enableCostTracking` | `true` | Calcular custos a partir dos JSONL |
| `workspaceCostOnly` | `false` | Custo só do workspace/projeto aberto |
| `costHistoryDays` | `7` | Dias no gráfico e no CSV (1–30) |

> **Nota:** A conta escolhida na sidebar fica salva no **storage global** da extensão. `configDir` nas settings, se preenchido, sobrescreve tudo (uso avançado).

### Exemplo: priorizar API em conta Team

Cadastre a pasta da empresa na sidebar e, nas settings:

```json
{
  "claudeUsage.preferApi": true,
  "claudeUsage.apiCooldownSeconds": 120
}
```

## Build e release

O script interativo `build.sh`:

1. Pergunta **patch / minor / major**
2. Pergunta o que mudou (linhas para o changelog)
3. Atualiza `package.json` e `CHANGELOG.md` (versão nova no topo)
4. Compila (`npm run compile`) e gera o `.vsix`

```bash
chmod +x build.sh   # uma vez
./build.sh
```

Publicar no Marketplace (após `vsce login`):

```bash
npx @vscode/vsce publish
```

## Privacidade

- Dados de sessão e cache ficam **no seu disco**.
- Chamadas de rede: apenas a **API oficial da Anthropic** para quota OAuth (quando cache/API estão habilitados).
- **Sem telemetria** da extensão.
- Credenciais: arquivo local ou **Keychain** no macOS — nunca logadas em texto claro no Output (salvo com `debug` ligado para diagnóstico).

## Solução de problemas

| Sintoma | O que tentar |
|---------|----------------|
| Quota sempre vazia (Team) | Ative `preferApi` ou aguarde login OAuth; verifique Keychain / `~/.claude-work` |
| HTTP 429 | Aumente `apiCooldownSeconds`; desligue `apiOnFocus` ou reduza `refreshIntervalSeconds` |
| Custo zerado | Confirme JSONL em `projects/` da conta selecionada; rode **Recalcular custos** |
| Conta errada | Troque em **Conta** na sidebar ou cadastre a pasta correta com **Adicionar pasta** |

Com `claudeUsage.debug: true`, abra **Claude Usage: Mostrar log de debug** para ver origem dos dados (cache, API, keychain).

## Changelog

Veja [CHANGELOG.md](./CHANGELOG.md).

## Licença

Sem licença definida no repositório ainda. Adicione um `LICENSE` antes de publicar publicamente se desejar open source explícito.
