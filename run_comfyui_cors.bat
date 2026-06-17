@echo off
call C:\Users\mosmo\miniconda3\Scripts\activate.bat genai
cd /d D:\ComfyUI
python main.py --enable-cors-header "*" --lowvram
pause
