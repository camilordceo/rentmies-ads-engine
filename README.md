# Rentmies — Ads Generator

Genera 5 ads de Instagram (imagen 1080x1080 + copy) usando Gemini 1.5 Flash e Imagen 3.

Cada ad ataca un pain point real de arrendatarios en Colombia y produce:
- `ad_N.png` — imagen cuadrada lista para Instagram
- `ad_N.txt` — headline + descripción corta

## Setup

```powershell
cd C:\Users\camil\rentmies-growth-agents\ads-generator
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Correr

```powershell
python generate_post.py
```

Los archivos se guardan en `output/`.

## Variables requeridas en `../adsplatform.env`

```
GOOGLE_AI_API_KEY=...
```
