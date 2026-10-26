$ErrorActionPreference = 'Stop'

Write-Host "Preparando o Git para o Nosso Story..." -ForegroundColor Cyan

try {
    git --version | Out-Null
} catch {
    throw "Git não foi encontrado. Instale-o em https://git-scm.com/downloads e abra um novo terminal."
}

$insideRepo = $false
try {
    git rev-parse --is-inside-work-tree 2>$null | Out-Null
    $insideRepo = ($LASTEXITCODE -eq 0)
} catch {
    $insideRepo = $false
}

if (-not $insideRepo) {
    git init -b main
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível inicializar o repositório Git." }
} else {
    Write-Host "Já existe um repositório Git nesta pasta; vou reutilizá-lo." -ForegroundColor Yellow
}

$name = git config user.name
if ([string]::IsNullOrWhiteSpace($name)) {
    $name = Read-Host "Informe o nome para os commits Git"
    if ([string]::IsNullOrWhiteSpace($name)) { throw "O nome do autor não pode ficar vazio." }
    git config user.name $name
}

$email = git config user.email
if ([string]::IsNullOrWhiteSpace($email)) {
    $email = Read-Host "Informe o e-mail associado à sua conta Git"
    if ([string]::IsNullOrWhiteSpace($email)) { throw "O e-mail do autor não pode ficar vazio." }
    git config user.email $email
}

git add .
if ($LASTEXITCODE -ne 0) { throw "Não foi possível preparar os arquivos para o commit." }

$hasCommit = $true
git rev-parse --verify HEAD 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { $hasCommit = $false }

if (-not $hasCommit) {
    git commit -m "chore: estrutura inicial React e Express"
    if ($LASTEXITCODE -ne 0) { throw "O commit inicial falhou. Confira as mensagens do Git." }
} else {
    Write-Host "O repositório já tem pelo menos um commit. Os arquivos foram adicionados ao staging." -ForegroundColor Yellow
    git status --short
}

Write-Host "\nGit local preparado." -ForegroundColor Green
Write-Host "Próximo passo: crie um repositório vazio no GitHub e siga as instruções de envio no README.md." -ForegroundColor Green
