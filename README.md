# YUVA Code

A minimal, NVIDIA-powered AI coding CLI. Tells a model to actually write/read/edit/run code instead of pasting it into chat.

## Install

```bash
git clone https://github.com/Aftab-web-dev/yuvacode.git
cd yuvacode
npm install
npm link    # or: npm install -g .
```

## Setup

You need a free NVIDIA API key from <https://build.nvidia.com/>.

```bash
yuva --setup
```

The wizard prompts for your key and lets you pick a model from the curated list:

- `meta/llama-3.3-70b-instruct` (default — best balance for tool use)
- `nvidia/llama-3.1-nemotron-70b-instruct`
- `qwen/qwen2.5-coder-32b-instruct`
- `mistralai/mistral-large-2-instruct`

Config is saved to `~/.yuva-ai/config.json`.

## Use

```bash
yuva
```

Type a request like `add a hello function to src/foo.js`. The model will read files, edit them, and run shell commands as needed. You'll be asked to approve any destructive action (`shell`, `write_file`, `edit_file`); `read_file` and `list_files` run automatically.

### Slash commands

| Command | What it does |
|---|---|
| `/help` | Show command list |
| `/clear` | Clear the conversation |
| `/model` | Switch model (interactive picker) |
| `/config` | Show config path + masked API key |
| `/cd <path>` | Change working directory |
| `/exit` | Quit |
| `!<command>` | Run a shell command directly (no permission prompt — `!` is your consent) |

## Tools the model has

- `read_file` — read file contents (capped at 256 KB)
- `write_file` — write a file (creates parent dirs; permission required)
- `edit_file` — replace a unique substring with new text (permission required; rejects non-unique or missing matches)
- `list_files` — list directory entries
- `shell` — run a shell command (60-second timeout; output capped at 1 MB per stream; permission required)

## Requirements

- Node.js ≥ 20
- A free NVIDIA Build account at <https://build.nvidia.com/>

## License

MIT
