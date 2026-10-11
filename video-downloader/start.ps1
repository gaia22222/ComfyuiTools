$ErrorActionPreference = 'Stop'
$toolDirectory = $PSScriptRoot
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) { throw 'Python 3.10+ is required. Install Python, then run this launcher again.' }
$pythonPath = $pythonCommand.Source
if (-not (Test-Path -LiteralPath (Join-Path $toolDirectory 'vendor\yt_dlp\__init__.py'))) {
    & $pythonPath -m pip install --target (Join-Path $toolDirectory 'vendor') -r (Join-Path $toolDirectory 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection.' }
}
$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffmpegLocal = Join-Path $toolDirectory 'bin\ffmpeg.exe'
$ffmpegPython = Join-Path (Split-Path $pythonPath) 'Library\bin\ffmpeg.exe'
if (-not $ffmpegCommand -and -not (Test-Path -LiteralPath $ffmpegLocal) -and -not (Test-Path -LiteralPath $ffmpegPython)) {
    throw 'FFmpeg is required. Put ffmpeg.exe and ffprobe.exe in video-downloader\bin, or add them to PATH.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js 22+ is required for YouTube support.' }
Write-Host 'Open http://127.0.0.1:8910/index.html for ToolHub, or /VideoDownloader.html for the downloader.'
Write-Host 'Keep this window open while downloading. Press Ctrl+C to stop.'
& $pythonPath (Join-Path $toolDirectory 'server.py')
