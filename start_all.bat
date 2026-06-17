@echo off
echo Starting ComfyUI + website server...

:: Start website server in separate window — /d sets working dir without nested quotes
start "Website Server" /d "d:\Marina\MaCAD 2025\3 SEMESTER\Generative AI\FINAL\Generative-AI-the-likable-public-" cmd /k python -m http.server 8000

:: Open browser after short delay
timeout /t 2 /nobreak >nul
start "" "http://localhost:8000/likable_public_v3.html"

:: Start ComfyUI in this window (same as original run_comfyui_cors.bat)
call C:\Users\mosmo\miniconda3\Scripts\activate.bat genai
cd /d D:\ComfyUI
python main.py --auto-launch --enable-cors-header "*"
pause
