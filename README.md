# Claude Usage Status (VS Code)

Extensão para Visual Studio Code / Cursor com **quota local**, **custo estimado**, **sidebar**, **alertas** e **export CSV**.

## Funcionalidades (v0.2)

| Recurso | Descrição |
|---------|-----------|
| **Status bar** | Quota 5h, tempo até reset, custo hoje (est.) |
| **Alertas** | Notificação em 70% / 90% (configurável) |
| **Painel** | Barras de quota + gráfico de custo 7 dias |
| **Sidebar** | Activity Bar → ícone pulse → árvore resumo |
| **Custo JSONL** | Parse de `~/.claude/projects/**/*.jsonl` |
| **Workspace** | Custo só do projeto aberto (opcional) |
| **API OAuth** | Fallback + refresh token + poll ao focar janela |
| **Caches** | Compara `~/.claude` vs `~/.claude-work` |
| **stats-cache** | Lê totais se existir `stats-cache.json` |
| **CSV** | Exportar quota + custos diários |
| **Debug** | Output channel `Claude Usage` |

## Desenvolvimento

```bash
npm install
npm run compile
# F5 → Extension Development Host
```

## Comandos

- `Claude Usage: Atualizar`
- `Claude Usage: Abrir painel`
- `Claude Usage: Exportar CSV`
- `Claude Usage: Recalcular custos (JSONL)`
- `Claude Usage: Mostrar log de debug`

## Configurações (`claudeUsage.*`)

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `refreshIntervalSeconds` | 60 | Polling geral |
| `preferApi` | false | Priorizar API vs cache |
| `apiOnFocus` | true | API ao focar janela |
| `debug` | false | Log no Output |
| `enableAlerts` | true | Notificações de quota |
| `alertThresholdWarning` | 0.7 | Limite amarelo |
| `alertThresholdCritical` | 0.9 | Limite vermelho |
| `enableCostTracking` | true | Parse JSONL |
| `workspaceCostOnly` | false | Só workspace atual |
| `costHistoryDays` | 7 | Dias no gráfico/CSV |
| `configProfile` | `default` | `default` / `claude` → ~/.claude · `claude-work` → ~/.claude-work |
| `configDir` | "" | Caminho custom (sobrescreve `configProfile`) |

### Duas contas (.claude e .claude-work)

Na sidebar **Claude Usage → Conta**, use o **select** para alternar:

- **Pessoal** — `~/.claude`
- **Trabalho (Team)** — `~/.claude-work`

O mesmo select aparece no **painel** principal. A escolha é salva e **só os dados da conta selecionada** são exibidos (status bar, custos, quota).

Atalhos: `Claude Usage: Escolher conta` ou comandos para cada pasta.

## Fontes de dados

1. `vscode-claude-status-cache.json` — quota (extensão oficial Claude)
2. `GET api.anthropic.com/api/oauth/usage` — quota via OAuth
3. `~/.claude/projects/**/*.jsonl` — tokens → custo estimado
4. `stats-cache.json` — totais do `/usage` CLI (se existir)

Custos são **estimados** por modelo (Sonnet/Haiku/Opus) quando não há `costUSD` no JSONL.

## Privacidade

Tudo local + API Anthropic apenas para quota OAuth. Nenhum telemetria da extensão.
