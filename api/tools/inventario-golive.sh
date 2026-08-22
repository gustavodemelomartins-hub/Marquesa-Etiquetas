#!/usr/bin/env sh
set -eu

# Atalho de compatibilidade. A implementação real é Node.js e, no Windows,
# deve ser chamada diretamente com `npm run inventario:golive`.
exec node "$(dirname "$0")/inventario-golive.mjs" "$@"
